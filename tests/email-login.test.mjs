import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./helpers/components.mjs";
import * as phone from "../src/utils/phone.ts";

const require = createRequire(import.meta.url);

function setup({
  methods = [],
  lookupError,
  policyError,
  verificationError,
  phoneSendError,
  phoneConfirmError,
  emailLinkError,
  props = {},
} = {}) {
  const state = [];
  let cursor = 0;
  const calls = [];
  const policyChecks = [];
  const captchaCalls = [];
  const authInstance = { currentUser: props.linking ? { uid: "signed-in-user" } : null };
  const createdUser = { uid: "created-user", email: "new@example.com", emailVerified: false };
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
      return { verificationId: "test", confirm: async () => ({ user: createdUser }) };
    },
    linkWithPhoneNumber: async (user, number) => {
      calls.push(["linkSms", user.uid, number]);
      if (phoneSendError) throw { code: phoneSendError };
      return {
        verificationId: "test",
        confirm: async (code) => {
          calls.push(["confirmLink", code]);
          if (phoneConfirmError) throw { code: phoneConfirmError };
          return { user };
        },
      };
    },
    isSignInWithEmailLink: () => false,
    fetchSignInMethodsForEmail: async (_auth, email) => {
      calls.push(["lookup", email]);
      if (lookupError) throw { code: lookupError };
      return typeof methods === "function" ? methods(email) : methods;
    },
    createUserWithEmailAndPassword: async (_auth, email, password) => {
      assert.equal(_auth, props.auth || authInstance);
      calls.push(["create", email, password]);
      createdUser.email = email;
      return { user: createdUser };
    },
    sendEmailVerification: async (user) => {
      calls.push(["verifyEmail", user.uid]);
      if (verificationError) throw { code: verificationError };
    },
    reload: async () => {},
    EmailAuthProvider: { credential: (email, password) => ({ email, password }) },
    linkWithCredential: async (user, credential) => {
      calls.push(["link", user.uid, credential.email]);
      if (emailLinkError) throw { code: emailLinkError };
      user.email = credential.email;
      user.emailVerified = false;
      return { user };
    },
    signInWithEmailAndPassword: async (_auth, email, password) =>
      calls.push(["signIn", email, password]),
  };
  const verification = loadComponent("auth/EmailVerification", { "firebase/auth": auth });

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
      if (name === "./EmailVerification") return verification;
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
    authError: componentExports.authError,
    submitDisabled: () =>
      find(render(), (element) => element.props?.className === "dashboard-primary-button").props
        .disabled,
    async click(label) {
      const button = find(
        render(),
        (element) => element.type === "button" && element.props.children === label,
      );
      assert.ok(button, label);
      await button.props.onClick();
      await new Promise((resolve) => setImmediate(resolve));
    },
    buttonDisabled: (label) =>
      find(render(), (element) => element.type === "button" && element.props.children === label)
        .props.disabled,
    verificationHtml: () =>
      renderToStaticMarkup(
        require("react").createElement(verification.default, { user: createdUser }),
      ),
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
  assert.match(form.html(), /Create A Password/);
  assert.match(form.html(), /autocomplete="new-password"/i);
  assert.match(form.html(), /value="new@example.com"/);
  assert.equal((form.html().match(/<form/g) || []).length, 1);
  form.change("new-password");
  await form.submit();
  assert.deepEqual(form.calls[1], ["create", "new@example.com", "new-password"]);
  assert.deepEqual(form.calls[2], ["verifyEmail", "created-user"]);
  assert.match(form.verificationHtml(), /Verification email sent/);
});

test("email-delivery failure preserves the created account and passes control to setup with a retry", async () => {
  const authenticated = [];
  const form = setup({
    verificationError: "auth/network-request-failed",
    props: { onAuthenticated: async (user) => authenticated.push(user.uid) },
  });
  form.change("new@example.com");
  await form.submit();
  form.change("new-password");
  await form.submit();
  assert.deepEqual(authenticated, ["created-user"]);
  assert.equal(form.calls.filter(([action]) => action === "create").length, 1);
  assert.match(form.verificationHtml(), /role="alert"/);
  assert.match(form.verificationHtml(), /Unable to send the verification email/);
  assert.match(form.verificationHtml(), /Resend Verification Email/);
});

test("adding an email/password to a phone account sends its verification automatically", async () => {
  let linked = 0;
  const form = setup({
    props: { linking: true, contactType: "email", onLinked: () => linked++ },
  });
  form.authInstance.currentUser = { uid: "phone-account", email: null, emailVerified: false };
  form.change("member@example.com");
  await form.submit();
  form.change("new-password");
  await form.submit();
  assert.deepEqual(form.calls, [
    ["lookup", "member@example.com"],
    ["link", "phone-account", "member@example.com"],
    ["verifyEmail", "phone-account"],
  ]);
  assert.equal(linked, 1);
});

test("secondary contact creation verifies the new email identity rather than the main signed-in user", async () => {
  const authenticated = [];
  const form = setup({
    props: {
      auth: { currentUser: null },
      onAuthenticated: async (user) => authenticated.push(user.uid),
    },
  });
  form.authInstance.currentUser = { uid: "primary-phone-user", email: null };
  form.change("secondary@example.com");
  await form.submit();
  form.change("new-password");
  await form.submit();
  assert.deepEqual(form.calls, [
    ["lookup", "secondary@example.com"],
    ["create", "secondary@example.com", "new-password"],
    ["verifyEmail", "created-user"],
  ]);
  assert.deepEqual(authenticated, ["created-user"]);
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
  assert.doesNotMatch(form.html(), /Create A Password|Create Your Account/);
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

test("profile email linking checks availability before collecting a new password", async () => {
  const form = setup({ props: { linking: true, contactType: "email", embedded: true } });
  form.change("member@example.com");
  await form.submit();
  assert.deepEqual(form.calls, [["lookup", "member@example.com"]]);
  assert.match(form.html(), /type="password"/);
});

test("invalid email and phone identifiers disable submission and never reach Firebase", async () => {
  for (const [contactType, invalid, valid] of [
    ["email", "member@example..com", "member@example.com"],
    ["phone", "905 555", "+19055550123"],
  ]) {
    const form = setup({ props: { linking: true, contactType } });
    assert.equal(form.submitDisabled(), true);
    form.change(invalid);
    assert.equal(form.submitDisabled(), true);
    await form.submit();
    await form.blur();
    assert.deepEqual(form.calls, []);
    assert.match(form.html(), /role="alert"/);
    form.change(valid);
    assert.equal(form.submitDisabled(), false);
  }
});

test("existing email addresses are blocked before collecting credentials and remain blocked across case changes", async () => {
  const form = setup({
    methods: (email) => (email.toLowerCase() === "taken@example.com" ? ["password"] : []),
    props: { linking: true, contactType: "email" },
  });
  form.change("taken@example.com");
  await form.blur();
  assert.match(form.html(), /email address already belongs to another account/);
  assert.doesNotMatch(form.html(), /type="password"/);
  assert.equal(form.submitDisabled(), true);
  await form.submit();
  form.changeIdentifier("TAKEN@example.com");
  await form.blur();
  assert.equal(form.submitDisabled(), true);
  assert.deepEqual(form.calls, [["lookup", "taken@example.com"]]);
  form.changeIdentifier("available@example.com");
  assert.equal(form.submitDisabled(), false);
  await form.submit();
  assert.match(form.html(), /Create A Password/);
  assert.equal(form.submitDisabled(), true);
  form.change("new-password");
  assert.equal(form.submitDisabled(), false);
});

test("an email becoming unavailable between lookup and save disables retries without linking it", async () => {
  const form = setup({
    emailLinkError: "auth/email-already-in-use",
    props: { linking: true, contactType: "email" },
  });
  form.change("taken@example.com");
  await form.submit();
  form.change("new-password");
  await form.submit();
  assert.match(form.html(), /email address already belongs to another account/);
  assert.doesNotMatch(form.html(), /auth\/email-already-in-use/);
  assert.equal(form.submitDisabled(), true);
  await form.submit();
  assert.equal(form.calls.filter(([action]) => action === "link").length, 1);
  assert.ok(!form.calls.some(([action]) => action === "verifyEmail"));
});

for (const conflict of [
  "auth/account-exists-with-different-credential",
  "auth/credential-already-in-use",
  "auth/phone-number-already-exists",
])
  test(`SMS account conflicts disable Save and resend until the phone is changed: ${conflict}`, async () => {
    const form = setup({
      phoneConfirmError: conflict,
      props: { linking: true, contactType: "phone" },
    });
    form.change("(905) 555-0123");
    form.attachCaptcha();
    await form.submit();
    assert.match(form.html(), /Verify and Save Phone/);
    assert.doesNotMatch(form.html(), /Verify And Save Phone/);
    assert.equal(form.submitDisabled(), true);
    form.change("12345");
    assert.equal(form.submitDisabled(), true);
    await form.submit();
    assert.equal(form.calls.length, 1);
    form.change("123456");
    assert.equal(form.submitDisabled(), false);
    await form.submit();
    assert.match(form.html(), /phone number already belongs to another account/);
    assert.doesNotMatch(form.html(), /auth\/account-exists|auth\/credential-already/);
    assert.equal(form.submitDisabled(), true);
    assert.equal(form.buttonDisabled("Send Another Code"), true);
    await form.submit();
    await form.click("Send Another Code");
    assert.equal(form.calls.length, 2);
    await form.click("Change Phone Number");
    form.change("9055550123");
    assert.equal(form.submitDisabled(), true, "formatting cannot bypass a confirmed duplicate");
    form.change("9055550124");
    assert.equal(form.submitDisabled(), false);
    await form.submit();
    assert.deepEqual(form.calls.at(-1), ["linkSms", "signed-in-user", "+19055550124"]);
  });

for (const failure of ["auth/code-expired", "auth/invalid-verification-code"])
  test(`code errors allow recovery without misreporting an account conflict: ${failure}`, async () => {
    const form = setup({
      phoneConfirmError: failure,
      props: { linking: true, contactType: "phone" },
    });
    form.change("9055550123");
    form.attachCaptcha();
    await form.submit();
    form.change("123456");
    await form.submit();
    assert.equal(form.submitDisabled(), true);
    assert.doesNotMatch(form.html(), /belongs to another account/);
    assert.equal(form.buttonDisabled("Send Another Code"), false);
    if (failure === "auth/code-expired") await form.click("Send Another Code");
    form.change("654321");
    assert.equal(form.submitDisabled(), false);
  });

test("late email availability results cannot block a corrected address", async () => {
  let finish;
  const delayed = new Promise((resolve) => (finish = resolve));
  const form = setup({
    methods: (email) => (email === "old@example.com" ? delayed : []),
    props: { linking: true, contactType: "email" },
  });
  form.change("old@example.com");
  const pending = form.submit();
  form.changeIdentifier("corrected@example.com");
  finish(["password"]);
  await pending;
  assert.match(form.html(), /value="corrected@example.com"/);
  assert.doesNotMatch(form.html(), /belongs to another account|type="password"/);
  assert.equal(form.submitDisabled(), false);
  await form.submit();
  assert.match(form.html(), /Create A Password/);
});

test("losing the signed-in session cannot turn contact linking into a new sign-in", async () => {
  const form = setup({ props: { linking: true, contactType: "phone" } });
  form.authInstance.currentUser = null;
  form.change("9055550123");
  form.attachCaptcha();
  assert.equal(form.submitDisabled(), true);
  await form.submit();
  assert.deepEqual(form.calls, []);
  assert.match(form.html(), /Sign in again before adding contact details/);
});
