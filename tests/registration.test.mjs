import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRegistrationService } from "../functions/registration.cjs";

const context = (uid) => ({ auth: { uid, token: { auth_time: Date.now() / 1000 - 10 } } });
const email = {
  uid: "email-user",
  email: "person@example.com",
  emailVerified: true,
  providerData: [{ providerId: "password" }],
};
const phone = {
  uid: "phone-user",
  phoneNumber: "+15195550123",
  providerData: [{ providerId: "phone" }],
};
const profile = {
  name: "New Player",
  notes: "Interested in lessons",
  membershipRequested: true,
  instrumentDetails: [
    { name: "Flute", ownership: "band", loanForm: "unsure", details: "Asset 42" },
  ],
};
const key = (type, value) =>
  `profile_contacts/${createHash("sha256").update(`${type}:${value}`).digest("hex")}`;

function setup({
  users = [email],
  documents = [],
  failAttach = false,
  failFinalize = false,
  failRollback = false,
} = {}) {
  const records = new Map(documents.map(([path, data]) => [path, structuredClone(data)]));
  const identities = new Map(users.map((user) => [user.uid, structuredClone(user)]));
  const authWrites = [];
  let clock = 1;
  const snapshot = (ref) => ({
    exists: records.has(ref.path),
    data: () => structuredClone(records.get(ref.path)),
    id: ref.path.split("/").at(-1),
    ref,
  });
  const db = {
    doc(path) {
      return { path, get: async () => snapshot(db.doc(path)) };
    },
    collection(name) {
      const query = (field, value) => ({
        get: async () => ({
          docs: [...records.entries()]
            .filter(
              ([path, data]) => path.startsWith(name + "/") && (!field || data[field] === value),
            )
            .map(([path]) => snapshot(db.doc(path))),
        }),
      });
      return { ...query(), where: (field, _operator, value) => query(field, value) };
    },
    async runTransaction(callback) {
      const writes = [];
      await callback({
        async get(ref) {
          assert.equal(writes.length, 0, "Firestore transactions must read before writing");
          return snapshot(ref);
        },
        set(ref, data, options) {
          writes.push(["set", ref.path, structuredClone(data), options?.merge]);
        },
        delete(ref) {
          writes.push(["delete", ref.path]);
        },
      });
      if (
        failFinalize &&
        writes.some(
          ([kind, path, data]) => kind === "set" && path === "users/phone-user" && data.merged_into,
        )
      ) {
        failFinalize = false;
        throw Error("commit unavailable");
      }
      for (const [kind, path, data, merge] of writes) {
        if (kind === "delete") records.delete(path);
        else records.set(path, merge ? { ...records.get(path), ...data } : data);
      }
    },
  };
  class HttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }
  const auth = {
    async getUser(uid) {
      if (!identities.has(uid)) throw { code: "auth/user-not-found" };
      return structuredClone(identities.get(uid));
    },
    async verifyIdToken(token, revoked) {
      assert.equal(revoked, true);
      if (!identities.has(token)) throw { code: "auth/invalid-id-token" };
      return { ...context(token).auth.token, uid: token };
    },
    async updateUser(uid, changes) {
      if (failAttach && uid === "email-user" && changes.phoneNumber) {
        failAttach = false;
        throw Error("attach failed");
      }
      if (failRollback && uid === "phone-user" && changes.phoneNumber)
        throw Error("rollback failed");
      for (const [id, existing] of identities)
        if (id !== uid && changes.phoneNumber && existing.phoneNumber === changes.phoneNumber)
          throw { code: "auth/phone-number-already-exists" };
      authWrites.push([uid, structuredClone(changes)]);
      identities.set(uid, { ...identities.get(uid), ...changes });
    },
    async deleteUser(uid) {
      authWrites.push(["delete", uid]);
      identities.delete(uid);
    },
  };
  const service = createRegistrationService({
    db,
    auth,
    HttpsError,
    FieldValue: { serverTimestamp: () => ({ seconds: clock++, nanoseconds: 0 }) },
  });
  return {
    records,
    identities,
    authWrites,
    call: (data, uid = email.uid) => service.handle(data, context(uid)),
  };
}
const rejects = (promise, code) => assert.rejects(promise, (error) => error.code === code);

test("new registrations ask for verified email before matching and do not create blank users", async () => {
  const fixture = setup({ users: [{ ...email, emailVerified: false }] });
  assert.equal((await fixture.call({ action: "prepare" })).state, "verifyEmail");
  assert.equal(fixture.records.has("users/email-user"), false);
  assert.equal(fixture.records.get("access/email-user").admin, false);
  await rejects(fixture.call({ action: "complete", profile, revision: "" }), "failed-precondition");
});

test("setup validates structured instruments and never grants requested roles", async () => {
  const fixture = setup();
  assert.equal((await fixture.call({ action: "prepare" })).state, "details");
  await fixture.call({
    action: "complete",
    profile: { ...profile, admin: true, member: true },
    revision: "",
  });
  const saved = fixture.records.get("users/email-user");
  assert.equal(saved.display_name, "New Player");
  assert.equal(saved.instruments, "Flute");
  assert.equal(saved.instrument_details[0].loan_form_status, "unsure");
  assert.equal(saved.membership_requested, true);
  assert.equal(saved.email, email.email);
  assert.equal(saved.admin, undefined);
  assert.equal(fixture.records.get("access/email-user").admin, false);
  assert.equal(fixture.records.get(key("email", email.email)).uid, email.uid);
  await rejects(fixture.call({ action: "complete", profile, revision: "" }), "aborted");
});

test("phone-only setup works and enforces instrument limits and loan answers", async () => {
  const fixture = setup({ users: [phone] });
  await rejects(
    fixture.call(
      {
        action: "complete",
        profile: {
          ...profile,
          instrumentDetails: [{ name: "Flute", ownership: "band", loanForm: "approved-by-admin" }],
        },
        revision: "",
      },
      phone.uid,
    ),
    "invalid-argument",
  );
  await fixture.call(
    { action: "complete", profile: { ...profile, instrumentDetails: [] }, revision: "" },
    phone.uid,
  );
  assert.equal(fixture.records.get("users/phone-user").phone, phone.phoneNumber);
  assert.equal(fixture.records.get("users/phone-user").email, "");
});

test("profile edits use a revision and preserve protected access and contacts", async () => {
  const fixture = setup({
    documents: [
      [
        "users/email-user",
        {
          display_name: "Existing",
          instruments: "Flute",
          updated_at: { seconds: 3, nanoseconds: 9 },
        },
      ],
      ["access/email-user", { member: true, admin: true, analyticsId: "existing" }],
    ],
  });
  assert.equal((await fixture.call({ action: "prepare" })).state, "complete");
  await rejects(fixture.call({ action: "saveProfile", profile, revision: "3:8" }), "aborted");
  await fixture.call({ action: "saveProfile", profile, revision: "3:9" });
  assert.equal(fixture.records.get("access/email-user").admin, true);
  assert.equal(fixture.records.get("access/email-user").analyticsId, "existing");
});

test("a private contact reservation prevents a second Firestore profile", async () => {
  const fixture = setup({
    documents: [[key("email", email.email), { uid: "another", type: "email" }]],
  });
  await rejects(fixture.call({ action: "complete", profile, revision: "" }), "already-exists");
  assert.equal(fixture.records.has("users/email-user"), false);
});

test("legacy matching waits until the contact choice and requires both stored contacts", async () => {
  const legacy = {
    display_name: "Legacy",
    email: email.email,
    phone: phone.phoneNumber,
    instruments: "Flute",
  };
  const fixture = setup({ documents: [["users/legacy", legacy]] });
  assert.equal((await fixture.call({ action: "prepare" })).state, "details");
  assert.equal(fixture.records.get("users/legacy").display_name, "Legacy");
  assert.deepEqual(await fixture.call({ action: "prepare", resolve: true }), {
    state: "verifyContact",
    contactType: "phone",
  });
  await rejects(fixture.call({ action: "complete", profile, revision: "" }), "already-exists");
  fixture.identities.get(email.uid).phoneNumber = phone.phoneNumber;
  assert.equal((await fixture.call({ action: "prepare", resolve: true })).state, "complete");
  assert.equal(fixture.records.get("users/email-user").display_name, "Legacy");
  assert.deepEqual(fixture.records.get("users/legacy"), { merged_into: email.uid });
});

test("ambiguous matches and privileged legacy profiles require review", async () => {
  const fixture = setup({
    documents: [
      ["users/one", { email: email.email }],
      ["users/two", { email: email.email }],
    ],
  });
  await rejects(fixture.call({ action: "prepare", resolve: true }), "already-exists");
  const privileged = setup({
    documents: [
      ["users/one", { email: email.email }],
      ["access/one", { admin: true }],
    ],
  });
  await rejects(privileged.call({ action: "prepare", resolve: true }), "permission-denied");
});

test("a matching profile tied to another live Auth UID requires proof or review", async () => {
  const fixture = setup({
    users: [email, { uid: "old-owner", email: "changed@example.com", emailVerified: true }],
    documents: [
      ["users/old-owner", { display_name: "Previous contact owner", email: email.email }],
    ],
  });
  await rejects(fixture.call({ action: "prepare", resolve: true }), "already-exists");
  assert.equal(fixture.records.has("users/email-user"), false);
  assert.equal(fixture.records.get("users/old-owner").display_name, "Previous contact owner");
});

test("proving both Auth identities connects the phone and preserves an existing member profile", async () => {
  const fixture = setup({
    users: [email, phone],
    documents: [
      ["users/phone-user", { display_name: "Existing Player", instruments: "Clarinet" }],
      ["access/phone-user", { member: true, admin: false, analyticsId: "keep-this-id" }],
    ],
  });
  const result = await fixture.call({ action: "link", otherToken: phone.uid });
  assert.equal(result.canonicalUid, email.uid);
  assert.equal(fixture.identities.get(email.uid).phoneNumber, phone.phoneNumber);
  assert.equal(fixture.identities.has(phone.uid), false);
  assert.equal(fixture.records.get("users/email-user").display_name, "Existing Player");
  assert.equal(fixture.records.get("access/email-user").member, true);
  assert.equal(fixture.records.get("access/email-user").admin, false);
  assert.equal(fixture.records.get("access/email-user").analyticsId, "keep-this-id");
  assert.deepEqual(fixture.records.get("users/phone-user"), { merged_into: email.uid });
  assert.deepEqual(fixture.records.get("access/phone-user"), { deleted: true });
});

test("linking a new phone from a phone session returns the existing email UID without creating profile duplicates", async () => {
  const fixture = setup({ users: [email, phone] });
  const result = await fixture.call({ action: "link", otherToken: email.uid }, phone.uid);
  assert.equal(result.canonicalUid, email.uid);
  assert.equal(fixture.records.has("users/email-user"), false);
  assert.equal((await fixture.call({ action: "prepare", resolve: true })).state, "details");
});

test("unverified identities, two established profiles and source admins cannot be automatically merged", async () => {
  const unverified = setup({ users: [{ ...email, emailVerified: false }, phone] });
  await rejects(unverified.call({ action: "link", otherToken: phone.uid }), "failed-precondition");
  for (const documents of [
    [
      ["users/email-user", { display_name: "A" }],
      ["users/phone-user", { display_name: "B" }],
    ],
    [["access/phone-user", { admin: true }]],
  ]) {
    const fixture = setup({ users: [email, phone], documents });
    await rejects(fixture.call({ action: "link", otherToken: phone.uid }), "failed-precondition");
    assert.equal(fixture.authWrites.length, 0);
  }
});

test("failed attachment or profile finalization restores the phone sign-in and unlocks profiles", async () => {
  for (const options of [{ failAttach: true }, { failFinalize: true }]) {
    const fixture = setup({ users: [email, phone], ...options });
    await assert.rejects(fixture.call({ action: "link", otherToken: phone.uid }));
    assert.equal(fixture.identities.get(phone.uid).phoneNumber, phone.phoneNumber);
    assert.equal(fixture.identities.get(email.uid).phoneNumber || null, null);
    assert.equal(fixture.records.get("access/email-user").linking, undefined);
    assert.equal(fixture.records.has("profile_links/phone-user"), false);
  }
});

test("an interrupted rollback keeps a recovery record and safely restores the original phone", async () => {
  const fixture = setup({ users: [email, phone], failAttach: true, failRollback: true });
  await assert.rejects(fixture.call({ action: "link", otherToken: phone.uid }));
  const job = fixture.records.get("profile_links/phone-user");
  assert.ok(job);
  assert.equal((await fixture.call({ action: "prepare" })).state, "linkPending");
  // Simulate the Auth restore having succeeded on retry, after the operation lease.
  fixture.identities.get(phone.uid).phoneNumber = phone.phoneNumber;
  job.startedAt = Date.now() - 130000;
  assert.equal((await fixture.call({ action: "prepare" })).state, "retrySignIn");
  assert.equal(fixture.records.has("profile_links/phone-user"), false);
  assert.equal(fixture.records.get("access/email-user").linking, undefined);
});

test("stale verified contacts are released when an existing Auth account changes", async () => {
  const fixture = setup({
    documents: [
      ["users/email-user", { display_name: "Existing", email: "old@example.com" }],
      [key("email", "old@example.com"), { uid: email.uid, type: "email" }],
    ],
  });
  await fixture.call({ action: "prepare" });
  assert.equal(fixture.records.has(key("email", "old@example.com")), false);
  assert.equal(fixture.records.get(key("email", email.email)).uid, email.uid);
});

test("recovery finishes an interrupted transfer after Auth has attached the phone", async () => {
  const fixture = setup({
    users: [
      { ...email, phoneNumber: phone.phoneNumber },
      { ...phone, phoneNumber: null },
    ],
    documents: [
      ["access/email-user", { member: false, admin: false, analyticsId: "new", linking: true }],
      ["access/phone-user", { member: true, admin: false, analyticsId: "original", linking: true }],
      ["users/phone-user", { display_name: "Existing Player", instruments: "Flute" }],
      [
        "profile_links/phone-user",
        {
          canonicalUid: email.uid,
          sourceUid: phone.uid,
          email: email.email,
          phone: phone.phoneNumber,
          operation: "interrupted",
          startedAt: Date.now() - 130000,
        },
      ],
    ],
  });
  assert.equal((await fixture.call({ action: "prepare" })).state, "retrySignIn");
  assert.equal(fixture.records.get("users/email-user").display_name, "Existing Player");
  assert.equal(fixture.records.get("access/email-user").analyticsId, "original");
  assert.equal(fixture.identities.has(phone.uid), false);
  assert.equal((await fixture.call({ action: "prepare" })).state, "complete");
});

test("a session without a verified contact cannot create a profile", async () => {
  const fixture = setup({ users: [{ uid: "no-contact", providerData: [] }] });
  await rejects(
    fixture.call({ action: "complete", profile, revision: "" }, "no-contact"),
    "failed-precondition",
  );
  assert.equal(fixture.records.has("users/no-contact"), false);
});
