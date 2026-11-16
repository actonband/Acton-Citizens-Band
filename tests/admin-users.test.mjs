import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import registration from "../functions/registration.cjs";

const source = readFileSync(new URL("../functions/index.cjs", import.meta.url), "utf8");
const recent = { auth: { uid: "administrator", token: { auth_time: 9999 } } };
const copy = (value) => JSON.parse(JSON.stringify(value));

function setup({
  permission = { admin: true },
  updateError,
  deleteError,
  cleanupError = false,
  beforeTransaction,
  failTransactionCommit = false,
} = {}) {
  const documents = new Map([
    ["access/administrator", permission],
    [
      "users/target",
      { display_name: "Member", instruments: "Flute", membership_requested: true, legacy: "keep" },
    ],
    ["access/target", { member: true, admin: false, analyticsId: "private-mapping" }],
  ]);
  const identities = new Map([
    ["target", { uid: "target", email: "member@example.com", phoneNumber: "+15195550123" }],
  ]);
  const writes = [];
  let transactionCount = 0;
  let failCleanup = cleanupError;
  const snapshot = (path) => ({ exists: documents.has(path), data: () => documents.get(path) });
  const commit = (changes) => {
    writes.push(...changes);
    for (const [kind, path, value, merge] of changes) {
      if (kind === "delete") documents.delete(path);
      else documents.set(path, merge ? { ...documents.get(path), ...value } : value);
    }
  };
  const db = {
    collection: (collection) => ({
      where: (field, _operator, value) => ({
        get: async () => ({
          docs: [...documents.entries()]
            .filter(([path, data]) => path.startsWith(collection + "/") && data[field] === value)
            .map(([path]) => ({ ref: db.doc(path) })),
        }),
      }),
    }),
    doc: (path) => ({ path, get: async () => snapshot(path) }),
    runTransaction: async (handler) => {
      transactionCount++;
      beforeTransaction?.(documents);
      const changes = [];
      await handler({
        get: async (ref) => snapshot(ref.path),
        set: (ref, value, options) => changes.push(["set", ref.path, copy(value), options?.merge]),
      });
      if (failTransactionCommit) throw new Error("Transaction unavailable");
      commit(changes);
    },
    batch: () => {
      const changes = [];
      return {
        delete: (ref) => changes.push(["delete", ref.path]),
        set: (ref, value) => changes.push(["set", ref.path, copy(value)]),
        commit: async () => {
          if (failCleanup) {
            failCleanup = false;
            throw new Error("Offline");
          }
          commit(changes);
        },
      };
    },
  };
  class HttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }
  const region = {
    https: { onCall: (handler) => handler },
    runWith: () => ({ auth: { user: () => ({ onDelete: (handler) => handler }) } }),
  };
  const dependencies = {
    "./registration.cjs": registration,
    "firebase-functions/v1": {
      region: () => region,
      https: { HttpsError },
      logger: { error() {} },
    },
    "firebase-admin/app": { initializeApp() {} },
    "firebase-admin/firestore": {
      getFirestore: () => db,
      FieldValue: { serverTimestamp: () => "server-time" },
    },
    "firebase-admin/auth": {
      getAuth: () => ({
        getUser: async (uid) => {
          if (!identities.has(uid)) throw { code: "auth/user-not-found" };
          return { ...identities.get(uid) };
        },
        updateUser: async (uid, changes) => {
          if (updateError) throw { code: updateError };
          writes.push(["updateAuth", uid, copy(changes)]);
          identities.set(uid, { ...identities.get(uid), ...changes });
        },
        deleteUser: async (uid) => {
          if (deleteError) throw { code: deleteError };
          writes.push(["deleteAuth", uid]);
          identities.delete(uid);
        },
      }),
    },
  };
  const sandbox = {
    exports: {},
    require: (name) => {
      assert.ok(dependencies[name]);
      return dependencies[name];
    },
    Date: { now: () => 10000000 },
  };
  vm.runInNewContext(source, sandbox);
  return {
    call: (data, context = recent) => sandbox.exports.manageDashboardUser(data, context),
    cleanup: sandbox.exports.cleanupDeletedDashboardAccount,
    documents,
    identities,
    writes,
    transactionCount: () => transactionCount,
  };
}
const rejected = (promise, code) => assert.rejects(promise, (error) => error.code === code);

test("admin profile editing stores instrument ownership, loan answers and notes without changing roles", async () => {
  const fixture = setup();
  await fixture.call({
    action: "updateProfile",
    uid: "target",
    name: "Player",
    instruments: "Trumpet",
    expected: { name: "Member", instruments: "Flute" },
    revision: "",
    profile: {
      name: "Player",
      notes: "Needs a case",
      membershipRequested: true,
      instrumentDetails: [
        { name: "Trumpet", ownership: "band", loanForm: "signed", details: "Asset 42" },
      ],
    },
  });
  const saved = fixture.documents.get("users/target");
  assert.deepEqual(saved.instrument_details, [
    { name: "Trumpet", ownership: "band", loan_form_status: "signed", details: "Asset 42" },
  ]);
  assert.equal(saved.notes, "Needs a case");
  assert.equal(fixture.documents.get("access/target").admin, false);
});

test("deleting a canonical user also removes contact mappings and redirected profiles", async () => {
  const fixture = setup();
  fixture.documents.set("profile_contacts/private-hash", { uid: "target", type: "phone" });
  fixture.documents.set("users/old-id", { merged_into: "target" });
  await fixture.call({ action: "delete", uid: "target", confirmation: "DELETE" });
  assert.equal(fixture.documents.has("profile_contacts/private-hash"), false);
  assert.equal(fixture.documents.has("users/old-id"), false);
  assert.deepEqual(fixture.documents.get("access/target"), { deleted: true });
});

test("every admin account action requires a currently authorized, non-deleted administrator", async () => {
  for (const action of [
    "get",
    "updateProfile",
    "updateProfileAndAccess",
    "updateContact",
    "updateAccess",
    "delete",
  ]) {
    const unauthenticated = setup();
    await rejected(unauthenticated.call({ uid: "target", action }, {}), "unauthenticated");
    for (const permission of [undefined, { admin: false }, { admin: true, deleted: true }]) {
      const fixture = setup({ permission: permission || {} });
      await rejected(fixture.call({ uid: "target", action }), "permission-denied");
      assert.equal(fixture.writes.length, 0);
    }
  }
});

test("admin lookup returns the profile and Auth contacts without exposing protected metadata", async () => {
  const fixture = setup();
  const details = copy(await fixture.call({ action: "get", uid: "target" }));
  assert.deepEqual(details, {
    uid: "target",
    name: "Member",
    instruments: "Flute",
    requested: true,
    access: { member: true, admin: false, past_member: false },
    email: "member@example.com",
    phone: "+15195550123",
    hasAuth: true,
    profileData: { instrument_details: [], notes: "" },
    revision: "",
  });
  assert.equal(fixture.writes.length, 0);
});

test("admin endpoint refuses self mutation and invalid target paths", async () => {
  const fixture = setup();
  for (const action of [
    "delete",
    "updateProfile",
    "updateProfileAndAccess",
    "updateContact",
    "updateAccess",
  ])
    await rejected(
      fixture.call({ action, uid: "administrator", confirmation: "DELETE" }),
      "permission-denied",
    );
  for (const uid of ["", "target/other", "x".repeat(129), null, "bad\nuid"])
    await rejected(fixture.call({ action: "get", uid }), "invalid-argument");
  assert.equal(fixture.writes.length, 0);
});

test("profile editing changes only allowlisted profile fields and preserves roles and legacy data", async () => {
  const fixture = setup();
  const result = await fixture.call({
    action: "updateProfile",
    uid: "target",
    name: " Updated ",
    instruments: " Drums ",
    expected: { name: "Member", instruments: "Flute" },
    admin: true,
    email: "ignored@example.com",
  });
  assert.equal(result.name, "Updated");
  assert.equal(result.instruments, "Drums");
  assert.equal(fixture.documents.get("users/target").legacy, "keep");
  assert.equal(fixture.documents.get("users/target").updated_at, "server-time");
  assert.equal(fixture.documents.get("access/target").admin, false);
  assert.equal(fixture.identities.get("target").email, "member@example.com");
  for (const changes of [
    { name: " " },
    { name: "x".repeat(101) },
    { instruments: "x".repeat(501) },
    { expected: null },
  ])
    await rejected(
      fixture.call({
        action: "updateProfile",
        uid: "target",
        name: "Updated",
        instruments: "Drums",
        expected: { name: "Updated", instruments: "Drums" },
        ...changes,
      }),
      "invalid-argument",
    );
});

test("stale profile edits and deletion during a save do not overwrite the newer state", async () => {
  for (const deleting of [false, true]) {
    const fixture = setup({
      beforeTransaction: (documents) => {
        if (deleting) documents.set("access/target", { deleted: true });
        else documents.get("users/target").instruments = "Trumpet";
      },
    });
    await rejected(
      fixture.call({
        action: "updateProfile",
        uid: "target",
        name: "Edited",
        instruments: "Drums",
        expected: { name: "Member", instruments: "Flute" },
      }),
      deleting ? "not-found" : "aborted",
    );
    assert.equal(fixture.writes.length, 0);
  }
});

const combinedProfileChange = {
  action: "updateProfileAndAccess",
  uid: "target",
  name: "Updated Member",
  instruments: "Clarinet",
  profile: {
    name: "Updated Member",
    instrumentDetails: [
      { name: "Clarinet", ownership: "personal", loanForm: "unsure", details: "Own instrument" },
    ],
    notes: "Updated profile notes",
    membershipRequested: true,
  },
  revision: "",
  expected: { name: "Member", instruments: "Flute" },
  userType: "admin",
  expectedAccess: { member: true, admin: false, requested: true },
};

test("profile and account type save in one transaction while preserving protected and legacy data", async () => {
  for (const userType of ["non-member", "past-member", "member", "admin"]) {
    const fixture = setup();
    const result = await fixture.call({ ...combinedProfileChange, userType });
    assert.equal(fixture.transactionCount(), 1);
    assert.equal(fixture.writes.length, 2);
    assert.equal(result.name, "Updated Member");
    assert.equal(result.instruments, "Clarinet");
    assert.equal(result.requested, false);
    assert.equal(result.profileData.notes, "Updated profile notes");
    assert.deepEqual(copy(result.access), {
      member: userType === "member" || userType === "admin",
      admin: userType === "admin",
      past_member: userType === "past-member",
    });
    assert.equal(fixture.documents.get("access/target").analyticsId, "private-mapping");
    assert.equal(fixture.documents.get("users/target").legacy, "keep");
    assert.equal(fixture.identities.get("target").email, "member@example.com");
  }
});

test("combined profile changes reject invalid account data and require a recent sign-in without partial writes", async () => {
  for (const changes of [
    { userType: "owner" },
    { expectedAccess: undefined },
    { expectedAccess: {} },
    { expectedAccess: { member: true, admin: "false", requested: true } },
    { expectedAccess: { member: true, admin: false, requested: true, past_member: "false" } },
  ]) {
    const fixture = setup();
    await rejected(fixture.call({ ...combinedProfileChange, ...changes }), "invalid-argument");
    assert.equal(fixture.writes.length, 0);
  }
  for (const token of [{}, { auth_time: 9000 }, { auth_time: 11000 }]) {
    const fixture = setup();
    await rejected(
      fixture.call(combinedProfileChange, { auth: { uid: "administrator", token } }),
      "failed-precondition",
    );
    assert.equal(fixture.writes.length, 0);
    assert.equal(fixture.documents.get("users/target").display_name, "Member");
  }
});

test("combined saves reject role/profile drift, deleted or linking targets and revoked admins before either write", async () => {
  for (const [mutate, code] of [
    [
      (docs) => {
        docs.get("access/target").admin = true;
      },
      "aborted",
    ],
    [
      (docs) => {
        docs.get("users/target").membership_requested = false;
      },
      "aborted",
    ],
    [
      (docs) => {
        docs.get("users/target").instruments = "Trumpet";
      },
      "aborted",
    ],
    [
      (docs) => {
        docs.get("users/target").updated_at = { seconds: 1, nanoseconds: 0 };
      },
      "aborted",
    ],
    [
      (docs) => {
        docs.get("access/target").linking = true;
      },
      "aborted",
    ],
    [
      (docs) => {
        docs.get("access/target").deleted = true;
      },
      "not-found",
    ],
    [
      (docs) => {
        docs.delete("users/target");
      },
      "not-found",
    ],
    [
      (docs) => {
        docs.get("access/administrator").admin = false;
      },
      "permission-denied",
    ],
    [
      (docs) => {
        docs.get("access/administrator").linking = true;
      },
      "permission-denied",
    ],
  ]) {
    const fixture = setup({ beforeTransaction: mutate });
    await rejected(fixture.call(combinedProfileChange), code);
    assert.equal(fixture.writes.length, 0);
  }
});

test("a failed combined transaction leaves the saved profile and account type unchanged", async () => {
  const fixture = setup({ failTransactionCommit: true });
  await assert.rejects(fixture.call(combinedProfileChange), /Transaction unavailable/);
  assert.equal(fixture.transactionCount(), 1);
  assert.equal(fixture.writes.length, 0);
  assert.equal(fixture.documents.get("users/target").display_name, "Member");
  assert.equal(fixture.documents.get("users/target").membership_requested, true);
  assert.equal(fixture.documents.get("access/target").admin, false);
});

test("contact edits and deletion require a recent sign-in and explicit deletion confirmation", async () => {
  const fixture = setup();
  for (const token of [{}, { auth_time: 9000 }, { auth_time: 11000 }])
    for (const action of ["delete", "updateContact", "updateAccess"])
      await rejected(
        fixture.call(
          { action, uid: "target", confirmation: "DELETE" },
          { auth: { uid: "administrator", token } },
        ),
        "failed-precondition",
      );
  await rejected(
    fixture.call({ action: "delete", uid: "target", confirmation: "delete" }),
    "invalid-argument",
  );
  assert.equal(fixture.writes.length, 0);
});

test("admins can explicitly switch between all account types while preserving unrelated data", async () => {
  for (const from of ["non-member", "past-member", "member", "admin"])
    for (const to of ["non-member", "past-member", "member", "admin"]) {
      const fixture = setup();
      const access = fixture.documents.get("access/target");
      access.member = from === "member" || from === "admin";
      access.admin = from === "admin";
      access.past_member = from === "past-member";
      const result = await fixture.call({
        action: "updateAccess",
        uid: "target",
        userType: to,
        expected: {
          member: access.member,
          admin: access.admin,
          past_member: access.past_member,
          requested: true,
        },
        analyticsId: "ignored",
        name: "Ignored",
      });
      assert.deepEqual(copy(result.access), {
        member: to === "member" || to === "admin",
        admin: to === "admin",
        past_member: to === "past-member",
      });
      assert.equal(result.requested, false);
      assert.equal(fixture.documents.get("access/target").analyticsId, "private-mapping");
      assert.equal(fixture.documents.get("users/target").display_name, "Member");
      assert.equal(fixture.documents.get("users/target").legacy, "keep");
      assert.equal(fixture.writes.filter(([kind]) => kind === "updateAuth").length, 0);
    }
});

test("account type changes reject invalid, stale, linking, deleted and revoked-admin states without writes", async () => {
  const request = {
    action: "updateAccess",
    uid: "target",
    userType: "admin",
    expected: { member: true, admin: false, requested: true },
  };
  for (const changes of [
    { userType: "owner" },
    { expected: {} },
    { expected: { member: "true", admin: false, requested: true } },
    { expected: { member: true, admin: false, requested: true, past_member: "true" } },
  ]) {
    const fixture = setup();
    await rejected(fixture.call({ ...request, ...changes }), "invalid-argument");
    assert.equal(fixture.writes.length, 0);
  }
  for (const [mutate, code] of [
    [
      (docs) => {
        docs.get("access/target").past_member = true;
      },
      "aborted",
    ],
    [
      (docs) => {
        docs.get("access/target").admin = true;
      },
      "aborted",
    ],
    [
      (docs) => {
        docs.get("users/target").membership_requested = false;
      },
      "aborted",
    ],
    [
      (docs) => {
        docs.get("access/target").linking = true;
      },
      "aborted",
    ],
    [
      (docs) => {
        docs.get("access/target").deleted = true;
      },
      "not-found",
    ],
    [
      (docs) => {
        docs.delete("users/target");
      },
      "not-found",
    ],
    [
      (docs) => {
        docs.get("access/administrator").admin = false;
      },
      "permission-denied",
    ],
    [
      (docs) => {
        docs.get("access/administrator").linking = true;
      },
      "permission-denied",
    ],
  ]) {
    const fixture = setup({ beforeTransaction: mutate });
    await rejected(fixture.call(request), code);
    assert.equal(fixture.writes.length, 0);
  }
});

test("phone updates normalize numbers and update only the selected Firebase Auth identity", async () => {
  for (const [value, normalized] of [
    ["519 555 9876", "+15195559876"],
    ["[519] 555–9876", "+15195559876"],
    ["Call: <519>/555_9876", "+15195559876"],
    ["++1/[519]/555_9876", "+15195559876"],
    ["+1 (519) 555-9876", "+15195559876"],
    ["15195559876", "+15195559876"],
    ["+44 20 7946 0123", "+442079460123"],
    ["+44/2079/4609", "+4420794609"],
  ]) {
    const fixture = setup();
    const result = await fixture.call({
      action: "updateContact",
      uid: "target",
      type: "phone",
      value,
      expected: "+15195550123",
    });
    assert.equal(result.phone, normalized);
    assert.equal(result.email, "member@example.com");
    assert.deepEqual(
      fixture.writes.filter((write) => write[0] === "updateAuth"),
      [["updateAuth", "target", { phoneNumber: normalized }]],
    );
    assert.equal(fixture.documents.get("users/target").phone, normalized);
    assert.equal(fixture.documents.get("access/target").analyticsId, "private-mapping");
  }
});

test("email updates mark the new address unverified and preserve the phone", async () => {
  const fixture = setup();
  const result = await fixture.call({
    action: "updateContact",
    uid: "target",
    type: "email",
    value: "new@example.com",
    expected: "member@example.com",
  });
  assert.equal(result.email, "new@example.com");
  assert.equal(result.phone, "+15195550123");
  assert.equal(fixture.identities.get("target").emailVerified, false);
  assert.equal(fixture.documents.get("users/target").email, "");
  assert.equal(fixture.documents.get("users/target").phone, "+15195550123");
});

test("duplicate contacts, malformed input and stale contact edits fail without writing", async () => {
  for (const updateError of ["auth/email-already-exists", "auth/phone-number-already-exists"]) {
    const fixture = setup({ updateError });
    await rejected(
      fixture.call({
        action: "updateContact",
        uid: "target",
        type: "email",
        value: "used@example.com",
        expected: "member@example.com",
      }),
      "already-exists",
    );
    assert.equal(fixture.writes.length, 0);
  }
  const fixture = setup();
  for (const changes of [
    { type: "admin" },
    { value: "not-an-email" },
    { value: "" },
    { type: "phone", value: "123", expected: "+15195550123" },
    { type: "phone", value: "+151955501234", expected: "+15195550123" },
  ])
    await rejected(
      fixture.call({
        action: "updateContact",
        uid: "target",
        type: "email",
        value: "new@example.com",
        expected: "member@example.com",
        ...changes,
      }),
      "invalid-argument",
    );
  await rejected(
    fixture.call({
      action: "updateContact",
      uid: "target",
      type: "email",
      value: "new@example.com",
      expected: "stale@example.com",
    }),
    "aborted",
  );
  assert.equal(fixture.writes.length, 0);
});

test("admin deletion removes only the selected identity/profile and retains the caller", async () => {
  const fixture = setup();
  assert.equal(
    (await fixture.call({ action: "delete", uid: "target", confirmation: "DELETE" })).deleted,
    true,
  );
  assert.equal(fixture.identities.has("target"), false);
  assert.equal(fixture.documents.has("users/target"), false);
  assert.deepEqual(fixture.documents.get("access/target"), { deleted: true });
  assert.deepEqual(fixture.documents.get("access/administrator"), { admin: true });
});

test("failed Auth deletion preserves the profile; failed cleanup is retried independently", async () => {
  const failed = setup({ deleteError: "auth/internal-error" });
  await assert.rejects(failed.call({ action: "delete", uid: "target", confirmation: "DELETE" }));
  assert.equal(failed.documents.has("users/target"), true);
  assert.equal(failed.writes.length, 0);
  const retry = setup({ cleanupError: true });
  assert.equal(
    (await retry.call({ action: "delete", uid: "target", confirmation: "DELETE" })).cleanupPending,
    true,
  );
  await retry.cleanup({ uid: "target" });
  assert.equal(retry.documents.has("users/target"), false);
});

test("legacy profile-only records can be viewed, edited and deleted without creating Auth users", async () => {
  const fixture = setup();
  fixture.identities.delete("target");
  fixture.documents.set("users/target", { first_name: "Old", last_name: "Member" });
  const result = await fixture.call({ action: "get", uid: "target" });
  assert.equal(result.name, "Old Member");
  assert.equal(result.hasAuth, false);
  await fixture.call({
    action: "updateProfile",
    uid: "target",
    name: "Renamed",
    instruments: "",
    expected: { name: "Old Member", instruments: "" },
  });
  await rejected(
    fixture.call({
      action: "updateContact",
      uid: "target",
      type: "email",
      value: "new@example.com",
      expected: "",
    }),
    "not-found",
  );
  await fixture.call({ action: "delete", uid: "target", confirmation: "DELETE" });
  assert.equal(
    fixture.writes.some(([kind]) => kind === "deleteAuth" || kind === "updateAuth"),
    false,
  );
  await rejected(fixture.call({ action: "get", uid: "target" }), "not-found");
});

test("legacy record cleanup failure is reported for retry rather than falsely confirming deletion", async () => {
  const fixture = setup({ cleanupError: true });
  fixture.identities.delete("target");
  await assert.rejects(fixture.call({ action: "delete", uid: "target", confirmation: "DELETE" }));
  assert.equal(fixture.documents.has("users/target"), true);
  assert.equal(
    (await fixture.call({ action: "delete", uid: "target", confirmation: "DELETE" })).deleted,
    true,
  );
});
