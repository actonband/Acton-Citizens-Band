import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadComponent } from "./helpers/components.mjs";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);

function setup({
  phone = false,
  verified = true,
  results = [{ state: "details", revision: "1:0" }],
} = {}) {
  const state = [];
  let cursor = 0;
  const effects = [];
  const calls = [];
  let completed = 0;
  const user = {
    uid: "primary",
    email: phone ? null : "new@example.com",
    phoneNumber: phone ? "+15195550123" : null,
    emailVerified: verified,
    getIdToken: async () => "primary-token",
  };
  const secondary = { currentUser: null };
  const react = {
    ...require("react"),
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [
        state[index],
        (value) => {
          state[index] = typeof value === "function" ? value(state[index]) : value;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = { current: initial };
      return state[index];
    },
    useEffect(callback) {
      const index = cursor++;
      if (!(index in state)) {
        state[index] = true;
        effects.push(callback);
      }
    },
  };

  const FakeLogin = () => react.createElement("form", null, "Contact verification");
  const FakeFields = () => react.createElement("label", null, "Name");
  const verificationAuth = {
    reload: async () => {},
    sendEmailVerification: async (u) => calls.push(["verifyEmail", u.uid]),
  };
  const verification = loadComponent("auth/EmailVerification", {
    react: {
      ...require("react"),
      useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    },
    "firebase/auth": verificationAuth,
  });
  const dependencies = {
    react,
    "firebase/app": { initializeApp: () => ({}), deleteApp: async () => {} },
    "firebase/auth": {
      getAuth: () => secondary,
      inMemoryPersistence: {},
      setPersistence: async () => {},
      signOut: async () => {},
      reload: async () => {},
      sendEmailVerification: async (u) => calls.push(["verifyEmail", u.uid]),
      updateCurrentUser: async (_auth, u) => calls.push(["session", u.uid]),
    },
    "../../utils/firebase": { firebaseApp: { options: {} }, firebaseAuth: { currentUser: user } },
    "../auth/Login": { default: FakeLogin, authError: () => "Auth error" },
    "../auth/EmailVerification": verification,
    "./ProfileFormFields": { default: FakeFields },
    "./registration": {
      profileDraft: () => ({
        name: "",
        notes: "",
        membershipRequested: false,
        instrumentDetails: [],
      }),
      registrationError: () => "Setup error",
      registration: async (data) => {
        calls.push(data);
        return results.shift() || { state: "complete" };
      },
    },
  };
  const componentExports = loadComponent(
    "profile/AccountSetup",
    (name) => dependencies[name] || require(name),
    {},
  );
  function render() {
    cursor = 0;
    const tree = componentExports.default({
      user,
      initial: { state: "details" },
      onComplete: () => completed++,
    });
    while (effects.length) effects.shift()();
    return tree;
  }
  function find(tree, predicate) {
    if (!tree || typeof tree !== "object") return;
    if (Array.isArray(tree)) return tree.map((child) => find(child, predicate)).find(Boolean);
    if (predicate(tree)) return tree;
    if (typeof tree.type === "function") return find(tree.type(tree.props), predicate);
    return find(tree.props?.children, predicate);
  }
  async function settle() {
    await new Promise((resolve) => setImmediate(resolve));
  }
  return {
    user,
    calls,
    get completed() {
      return completed;
    },
    html() {
      return renderToStaticMarkup(render());
    },
    async continue() {
      const form = find(render(), (item) => item.type === "form");
      assert.ok(form);
      await form.props.onSubmit({ preventDefault() {} });
      await settle();
    },
    async click(label) {
      const button = find(
        render(),
        (item) =>
          item.type === "button" && renderToStaticMarkup(item).replace(/<[^>]*>/g, "") === label,
      );
      assert.ok(button, label);
      await button.props.onClick();
      await settle();
    },
    async verifiedContact(other) {
      const login = find(render(), (item) => item.type === FakeLogin);
      assert.ok(login);
      await login.props.onAuthenticated(other);
      await settle();
    },
    setDraft(draft) {
      find(render(), (item) => item.type === FakeFields).props.onChange(draft);
    },
  };
}

test("first email registration asks about a phone before displaying profile details, with one form", async () => {
  const form = setup();
  assert.match(form.html(), /Add Phone\?/);
  assert.doesNotMatch(form.html(), /Tell us a little/);
  assert.equal((form.html().match(/<form/g) || []).length, 1);
  await form.continue();
  assert.match(form.html(), /Tell us a little about yourself/);
  assert.deepEqual(form.calls, [{ action: "prepare", resolve: true }]);
  assert.equal((form.html().match(/<form/g) || []).length, 1);
  const draft = { name: "Player", instrumentDetails: [], notes: "", membershipRequested: true };
  form.setDraft(draft);
  await form.continue();
  assert.deepEqual(form.calls[1], { action: "complete", profile: draft, revision: "1:0" });
  assert.equal(form.completed, 1);
});

test("an unverified email cannot reach profile matching until verification", async () => {
  const form = setup({ verified: false });
  form.html();
  await form.continue();
  assert.match(form.html(), /Verify Your Email/);
  assert.equal(form.calls.length, 0);
  await form.click("Resend Verification Email");
  assert.deepEqual(form.calls, [["verifyEmail", "primary"]]);
  form.user.emailVerified = true;
  await form.continue();
  assert.match(form.html(), /Tell us a little/);
});

test("phone registration offers email first and reuses a matching existing profile", async () => {
  const form = setup({ phone: true, results: [{ state: "complete" }] });
  assert.match(form.html(), /Add Email\?/);
  await form.continue();
  assert.equal(form.completed, 1);
  assert.equal(
    form.calls.some((call) => call.action === "complete"),
    false,
  );
});

test("verified second contact uses both-session proof and keeps the canonical email session", async () => {
  const form = setup({
    phone: true,
    results: [{ state: "linked", canonicalUid: "existing-email" }],
  });
  form.html();
  await form.click("Add Email");
  await form.verifiedContact({
    uid: "existing-email",
    email: "existing@example.com",
    emailVerified: true,
    getIdToken: async () => "verified-other-token",
  });
  assert.deepEqual(form.calls, [
    { action: "link", otherToken: "verified-other-token" },
    ["session", "existing-email"],
  ]);
  assert.equal(form.completed, 1);
});
