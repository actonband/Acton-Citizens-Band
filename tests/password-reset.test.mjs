import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./helpers/components.mjs";
const require = createRequire(import.meta.url);

function setup(policyError) {
  const state = [];
  const effects = [];
  const calls = [];
  let cursor = 0;
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
    useEffect(effect) {
      const index = cursor++;
      if (!(index in state)) {
        state[index] = true;
        effects.push(effect);
      }
    },
  };
  const NewPasswordInput = (props) =>
    react.createElement("input", { type: "password", value: props.value, readOnly: true });
  const dependencies = {
    react,
    "firebase/auth": {
      verifyPasswordResetCode: async () => "person@example.com",
      confirmPasswordReset: async (_auth, code, password) => calls.push(["save", code, password]),
    },
    "../../utils/firebase": { firebaseAuth: {} },
    "./NewPasswordInput": { default: NewPasswordInput },
    "../../utils/passwordPolicy": {
      validateNewPassword: async (_auth, password) => {
        calls.push(["validate", password]);
        if (policyError) throw { code: policyError };
      },
    },
  };

  const componentExports = loadComponent(
    "auth/ResetPassword",
    (name) => dependencies[name] || require(name),
    {
      location: { search: "?mode=resetPassword&oobCode=test-reset-code" },
      history: { replaceState: (_state, _title, url) => calls.push(["url", url]) },
    },
  );
  function render() {
    cursor = 0;
    const tree = componentExports.default();
    while (effects.length) effects.shift()();
    return tree;
  }
  function find(tree, predicate) {
    if (!tree || typeof tree !== "object") return;
    if (Array.isArray(tree)) return tree.map((child) => find(child, predicate)).find(Boolean);
    if (predicate(tree)) return tree;
    return find(tree.props?.children, predicate);
  }
  return {
    calls,
    async ready() {
      render();
      await new Promise((resolve) => setImmediate(resolve));
    },
    password(value) {
      find(render(), (item) => item.type === NewPasswordInput).props.onChange(value);
    },
    confirm(value) {
      find(render(), (item) => item.type === "input").props.onChange({ target: { value } });
    },
    async submit() {
      await find(render(), (item) => item.type === "form").props.onSubmit({ preventDefault() {} });
    },
    html: () => renderToStaticMarkup(render()),
  };
}
test("password reset validates policy before consuming a valid reset code", async () => {
  const form = setup();
  await form.ready();
  form.password("SyntheticTest!123");
  form.confirm("SyntheticTest!123");
  await form.submit();
  assert.deepEqual(form.calls, [
    ["validate", "SyntheticTest!123"],
    ["save", "test-reset-code", "SyntheticTest!123"],
    ["url", "/dashboard/"],
  ]);
  assert.match(form.html(), /Password Updated/);
});
test("a noncompliant new password leaves the reset code unconsumed", async () => {
  const form = setup("auth/password-does-not-meet-requirements");
  await form.ready();
  form.password("short");
  form.confirm("short");
  await form.submit();
  assert.deepEqual(form.calls, [["validate", "short"]]);
  assert.match(form.html(), /Choose a password that meets all the requirements/);
});
test("confirmation mismatch is reported before any password submission", async () => {
  const form = setup();
  await form.ready();
  form.password("SyntheticTest!123");
  form.confirm("different");
  await form.submit();
  assert.deepEqual(form.calls, []);
  assert.match(form.html(), /The passwords do not match/);
});
