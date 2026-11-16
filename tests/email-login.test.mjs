import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./helpers/components.mjs";
import * as phone from "../src/utils/phone.ts";

const require = createRequire(import.meta.url);

function setup({ methods = [], lookupError, policyError, props = {} } = {}) {
  const state = [];
  let cursor = 0;
  const calls = [];
  const policyChecks = [];
  const captchaCalls = [];
  const authInstance = { currentUser: null };
  const NewPasswordInput = ({ label, value, onChange }) =>
    require("react").createElement(
      "label",
      null,
      label,
      require("react").createElement("input", {
        type: "password",
        autoComplete: "new-password",
        value,
        onChange: (event) => onChange(event.target.value),
      }),
    );
  const react = {
    ...require("react"),
    useEffect() {},
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
  };
  const auth = {
    RecaptchaVerifier: class {
      constructor(...args) {
        captchaCalls.push(args);
      }
      clear() {}
    },
    signInWithPhoneNumber: async (_auth, phone) => {
      calls.push(["sms", phone]);
      return { verificationId: "test" };
    },
    isSignInWithEmailLink: () => false,
    fetchSignInMethodsForEmail: async (_auth, email) => {
      calls.push(["lookup", email]);
      if (lookupError) throw { code: lookupError };
      return methods;
    },
    createUserWithEmailAndPassword: async (_auth, email, password) =>
      calls.push(["create", email, password]),
    signInWithEmailAndPassword: async (_auth, email, password) =>
      calls.push(["signIn", email, password]),
  };

  const componentExports = loadComponent(
    "auth/Login",
    (name) => {
      if (name === "react") return react;
      if (name === "../../utils/analytics")
        return { measureDashboardAuth: (_action, _method, operation) => operation() };
      if (name === "firebase/auth") return auth;
      if (name === "../../utils/firebase") return { firebaseAuth: authInstance };
      if (name === "../../utils/phone") return phone;
      if (name === "../../utils/storage") return {};
      if (name === "./NewPasswordInput") return { default: NewPasswordInput };
      if (name === "../../utils/passwordPolicy")
        return {
          validateNewPassword: async (_auth, password) => {
            policyChecks.push(password);
            if (policyError) throw { code: policyError };
          },
        };
      return require(name);
    },
    { location: { href: "http://localhost:3000/dashboard/", hostname: "localhost" } },
  );
  const render = () => {
    cursor = 0;
    return componentExports.default(props);
  };
  function find(element, predicate) {
    if (!element || typeof element !== "object") return undefined;
    if (Array.isArray(element)) return element.map((child) => find(child, predicate)).find(Boolean);
    if (predicate(element)) return element;
    return find(element.props?.children, predicate);
  }
  return {
    calls,
    policyChecks,
    captchaCalls,
    authInstance,
    attachCaptcha() {
      find(render(), (element) => element.props?.className === "dashboard-captcha").ref.current =
        {};
    },
    html: () => renderToStaticMarkup(render()),
    change(value) {
      const tree = render();
      const field = find(tree, (element) => element.type === NewPasswordInput);
      if (field) {
        field.props.onChange(value);
        return;
      }
      (
        find(tree, (element) => element.type === "input" && element.props.type === "password") ||
        find(tree, (element) => element.type === "input")
      ).props.onChange({ target: { value } });
    },
    async blur() {
      const input = find(render(), (element) => element.type === "input");
      await input.props.onBlur({ target: { value: input.props.value } });
      await new Promise((resolve) => setImmediate(resolve));
    },
    changeIdentifier(value) {
      find(render(), (element) => element.type === "input").props.onChange({ target: { value } });
    },
    async submit() {
      await find(render(), (element) => element.type === "form").props.onSubmit({
        preventDefault() {},
      });
    },
  };
}

test("a new email is looked up and opens password creation without registering prematurely", async () => {
  const form = setup();
  form.change(" new@example.com ");
  await form.submit();
  assert.deepEqual(form.calls, [["lookup", "new@example.com"]]);
  assert.match(form.html(), /Create Your Account/);
  assert.match(form.html(), /Create a password/);
  assert.match(form.html(), /autocomplete="new-password"/i);
  assert.match(form.html(), /value="new@example.com"/);
  assert.equal((form.html().match(/<form/g) || []).length, 1);
  form.change("new-password");
  await form.submit();
  assert.deepEqual(form.calls[1], ["create", "new@example.com", "new-password"]);
});

test("phone verification uses the updated SDK's Auth-first reCAPTCHA constructor", async () => {
  const form = setup();
  form.change("(519) 555-0123");
  form.attachCaptcha();
  await form.submit();
  assert.equal(form.captchaCalls[0][0], form.authInstance);
  assert.deepEqual(form.captchaCalls[0][2], { size: "normal" });
  assert.deepEqual(form.calls, [["sms", "+15195550123"]]);
});

test("new-password policy failure prevents account creation", async () => {
  const form = setup({ policyError: "auth/password-does-not-meet-requirements" });
  form.change("new@example.com");
  await form.submit();
  form.change("too-short");
  await form.submit();
  assert.deepEqual(form.policyChecks, ["too-short"]);
  assert.deepEqual(form.calls, [["lookup", "new@example.com"]]);
  assert.match(form.html(), /Choose a password that meets all the requirements/);
});

test("existing-password sign-in never applies new-password requirements", async () => {
  const form = setup({
    methods: ["password"],
    policyError: "auth/password-does-not-meet-requirements",
  });
  form.change("existing@example.com");
  await form.submit();
  form.change("legacy-password");
  await form.submit();
  assert.deepEqual(form.policyChecks, []);
  assert.deepEqual(form.calls[1], ["signIn", "existing@example.com", "legacy-password"]);
});

test("email blur detects a new account inside the same form, and changing it clears the password", async () => {
  const form = setup();
  form.change("new@example.com");
  await form.blur();
  assert.match(form.html(), /Create Your Account/);
  assert.doesNotMatch(form.html(), /Create a password to start your account/);
  assert.doesNotMatch(form.html(), /This email is new/);
  form.change("secret-password");
  form.changeIdentifier("different@example.com");
  assert.doesNotMatch(form.html(), /type="password"|secret-password/);
  assert.match(form.html(), /value="different@example.com"/);
});

test("an existing email opens sign-in and keeps the existing account", async () => {
  const form = setup({ methods: ["password"] });
  form.change("existing@example.com");
  await form.submit();
  assert.doesNotMatch(form.html(), /Create a password|Create Your Account/);
  assert.match(form.html(), /autocomplete="current-password"/i);
  form.change("existing-password");
  await form.submit();
  assert.deepEqual(form.calls, [
    ["lookup", "existing@example.com"],
    ["signIn", "existing@example.com", "existing-password"],
  ]);
});

test("existing legacy-provider accounts are not treated as new registrations", async () => {
  const form = setup({ methods: ["google.com"] });
  form.change("legacy@example.com");
  await form.submit();
  assert.match(form.html(), /autocomplete="current-password"/i);
  assert.doesNotMatch(form.html(), /Create Your Account/);
});

test("a failed lookup stays on email entry and never creates an account", async () => {
  const form = setup({ lookupError: "auth/network-request-failed" });
  form.change("new@example.com");
  await form.submit();
  assert.match(form.html(), /role="alert"/);
  assert.match(form.html(), /value="new@example.com"/);
  assert.doesNotMatch(form.html(), /type="password"/);
  assert.equal(form.calls.length, 1);
});

test("profile contact linking does not use public email-existence lookup", async () => {
  const form = setup({ props: { linking: true, contactType: "email", embedded: true } });
  form.change("member@example.com");
  await form.submit();
  assert.equal(form.calls.length, 0);
  assert.match(form.html(), /type="password"/);
});
