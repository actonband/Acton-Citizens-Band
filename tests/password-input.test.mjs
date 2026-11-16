import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./helpers/components.mjs";
import { passwordCriteria } from "../src/utils/passwordPolicy.ts";
const require = createRequire(import.meta.url);

const status = (valid) => ({
  isValid: valid,
  meetsMinPasswordLength: valid,
  meetsMaxPasswordLength: true,
  containsNumericCharacter: valid,
  containsNonAlphanumericCharacter: valid,
  passwordPolicy: {
    customStrengthOptions: { minPasswordLength: 8, maxPasswordLength: 30 },
    allowedNonAlphanumericCharacters: "!@#",
  },
});
function setup() {
  const state = [];
  let cursor = 0;
  const effects = [];
  const requests = [];
  const auth = {};
  let value = "";
  const react = {
    ...require("react"),
    useId: () => `password-${cursor++}`,
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [
        state[index],
        (next) => {
          state[index] = typeof next === "function" ? next(state[index]) : next;
        },
      ];
    },
    useEffect(callback, deps) {
      const index = cursor++;
      const prior = state[index];
      if (!prior || deps.some((value, index) => value !== prior.deps[index])) {
        state[index] = { deps, cleanup: prior?.cleanup };
        effects.push(() => {
          state[index].cleanup?.();
          state[index].cleanup = callback();
        });
      }
    },
  };

  const componentExports = loadComponent(
    "auth/NewPasswordInput",
    (name) =>
      name === "react"
        ? react
        : name === "firebase/auth"
          ? {
              validatePassword: (_auth, password) =>
                new Promise((resolve, reject) => requests.push({ password, resolve, reject })),
            }
          : name === "../../utils/passwordPolicy"
            ? { passwordCriteria }
            : require(name),
    {},
  );
  const render = () => {
    cursor = 0;
    const tree = componentExports.default({
      auth,
      label: "Create A Password",
      value,
      onChange: (next) => {
        value = next;
      },
    });
    while (effects.length) effects.shift()();
    return tree;
  };
  const find = (tree, predicate) => {
    if (!tree || typeof tree !== "object") return;
    if (Array.isArray(tree)) return tree.map((child) => find(child, predicate)).find(Boolean);
    if (predicate(tree)) return tree;
    return find(tree.props?.children, predicate);
  };
  return {
    requests,
    html: () => renderToStaticMarkup(render()),
    type(next) {
      value = next;
      render();
    },
    async settle() {
      await new Promise((resolve) => setImmediate(resolve));
    },
    click(label) {
      find(
        render(),
        (item) => item.type === "button" && item.props.children === label,
      ).props.onClick();
    },
  };
}
test("new-password input shows Firebase requirements and live completion without inventing requirements", async () => {
  const form = setup();
  assert.match(form.html(), /Checking password requirements/);
  form.requests[0].resolve(status(false));
  await form.settle();
  assert.match(form.html(), /At least 8 characters/);
  assert.doesNotMatch(form.html(), /uppercase letter|lowercase letter/);
  form.type("Synthetic!123");
  form.requests.at(-1).resolve(status(true));
  await form.settle();
  assert.match(form.html(), /Your password meets all requirements/);
  assert.equal((form.html().match(/data-state="met"/g) || []).length, 4);
  form.click("Show");
  assert.match(form.html(), /type="text"/);
  form.click("Hide");
  assert.match(form.html(), /type="password"/);
});
test("symbol guidance appears only for unsupported symbols and clears when corrected", async () => {
  const form = setup();
  form.html();
  form.requests[0].resolve(status(false));
  await form.settle();
  assert.doesNotMatch(form.html(), /Allowed symbols|unsupported symbol/);
  form.type("Synthetic123😀");
  form.requests.at(-1).resolve(status(false));
  await form.settle();
  assert.match(form.html(), /includes an unsupported symbol/);
  assert.doesNotMatch(form.html(), /Allowed symbols/);
  form.type("Synthetic123!");
  form.requests.at(-1).resolve(status(true));
  await form.settle();
  assert.doesNotMatch(form.html(), /unsupported symbol/);
  form.type("Synthétique123!");
  form.requests.at(-1).resolve(status(true));
  await form.settle();
  assert.doesNotMatch(form.html(), /unsupported symbol/);
});

test("late results for an old password cannot replace current validation", async () => {
  const form = setup();
  form.html();
  const old = form.requests[0];
  form.type("Synthetic!123");
  form.requests.at(-1).resolve(status(true));
  await form.settle();
  old.resolve(status(false));
  await form.settle();
  assert.match(form.html(), /Your password meets all requirements/);
});
test("failed requirement retrieval has an inline retry", async () => {
  const form = setup();
  form.html();
  form.requests[0].reject(Error("Offline"));
  await form.settle();
  assert.match(form.html(), /Unable to load password requirements/);
  form.click("Retry Password Check");
  form.html();
  form.requests.at(-1).resolve(status(false));
  await form.settle();
  assert.match(form.html(), /Your password must meet these requirements/);
});
