import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./helpers/components.mjs";
import { formatPhoneNumber } from "../src/utils/phone.ts";

const { authError } = loadComponent("auth/Login", {
  "../../utils/firebase": {},
  "../../utils/analytics": {},
  "../../utils/storage": {},
  "../../utils/phone": {},
  "../../utils/passwordPolicy": {},
  "./NewPasswordInput": {},
});

function setup(
  t,
  {
    methods = ["password"],
    email = "admin@example.com",
    phone = "+15195550123",
    lookupError,
    passwordError,
    codeError,
    delayedPassword,
  } = {},
) {
  const state = [];
  let cursor = 0;
  const effects = [];
  const cleanups = new Map();
  const calls = [];
  const errors = [];
  const actor = {
    uid: "signed-in-admin",
    email,
    phoneNumber: phone,
    getIdToken: async (force) => {
      calls.push(["refresh", force]);
      return "not-exposed-token";
    },
  };
  const auth = { currentUser: actor };
  const handle = { current: null };
  const onError = (message) => errors.push(message);
  const View = loadComponent("auth/IdentityVerification", {
    react: {
      ...React,
      forwardRef: (render) => render,
      useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
        return [
          state[index],
          (next) => {
            state[index] = typeof next === "function" ? next(state[index]) : next;
          },
        ];
      },
      useRef(initial) {
        const index = cursor++;
        return (state[index] ||= { current: initial });
      },
      useEffect(effect, deps) {
        const index = cursor++;
        const previous = state[index];
        if (!previous || deps.some((item, i) => item !== previous[i])) {
          state[index] = deps;
          effects.push(() => {
            cleanups.get(index)?.();
            cleanups.set(index, effect());
          });
        }
      },
      useImperativeHandle(ref, create) {
        cursor++;
        ref.current = create();
      },
    },
    "firebase/auth": {
      fetchSignInMethodsForEmail: async (instance, address) => {
        assert.equal(instance, auth);
        calls.push(["methods", address]);
        if (lookupError) throw { code: lookupError };
        return methods;
      },
      EmailAuthProvider: { credential: (address, password) => ({ address, password }) },
      reauthenticateWithCredential: async (user, credential) => {
        assert.equal(user, actor);
        calls.push(["password", credential]);
        if (passwordError) throw { code: passwordError };
        await delayedPassword;
      },
      RecaptchaVerifier: class {
        constructor(instance, element, options) {
          assert.equal(instance, auth);
          assert.ok(element);
          assert.deepEqual(options, { size: "normal" });
          calls.push(["captcha"]);
        }
        clear() {
          calls.push(["clear_captcha"]);
        }
      },
      reauthenticateWithPhoneNumber: async (user, destination) => {
        assert.equal(user, actor);
        calls.push(["sms", destination]);
        return {
          confirm: async (code) => {
            calls.push(["confirm", code]);
            if (codeError) throw { code: codeError };
            return { user: actor };
          },
        };
      },
    },
    "../../utils/firebase": { firebaseAuth: auth },
    "../../utils/phone": { formatPhoneNumber },
    "../../utils/analytics": {
      measureDashboardAuth: async (action, method, operation) => {
        calls.push(["analytics", action, method]);
        return operation();
      },
    },
    "./Login": { authError },
  }).default;
  function render() {
    cursor = 0;
    const tree = View({ auth, onError }, handle);
    while (effects.length) effects.shift()();
    return tree;
  }
  function find(node, predicate) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.map((item) => find(item, predicate)).find(Boolean);
    if (predicate(node)) return node;
    return find(node.props?.children, predicate);
  }
  function unmount() {
    cleanups.forEach((cleanup) => cleanup?.());
    cleanups.clear();
    handle.current = null;
  }
  t.after(unmount);
  return {
    calls,
    errors,
    auth,
    async ready() {
      render();
      await new Promise((resolve) => setImmediate(resolve));
      render();
    },
    html: () => renderToStaticMarkup(render()),
    enter(value) {
      find(render(), (node) => node.type === "input").props.onChange({ target: { value } });
      render();
    },
    switch(label) {
      find(
        render(),
        (node) => node.type === "button" && node.props.children === label,
      ).props.onClick();
      render();
    },
    attachCaptcha() {
      find(render(), (node) => node.props?.className === "dashboard-captcha").ref.current = {};
    },
    verify() {
      render();
      return handle.current.verify();
    },
    unmount,
  };
}

test("password verification uses only the current account and refreshes its token for the pending save", async (t) => {
  const view = setup(t);
  await view.ready();
  const html = view.html();
  assert.match(html, /type="password"/);
  assert.doesNotMatch(html, /type="email"|type="tel"|Continue|<form|Sign In again/);
  assert.deepEqual(view.calls, [["methods", "admin@example.com"]]);
  view.enter("existing-password");
  assert.equal(await view.verify(), true);
  assert.deepEqual(view.calls.slice(-3), [
    ["analytics", "reauthenticate", "email"],
    ["password", { address: "admin@example.com", password: "existing-password" }],
    ["refresh", true],
  ]);
  assert.doesNotMatch(view.html(), /existing-password/);
});

test("incorrect passwords keep verification open and never refresh a token", async (t) => {
  const view = setup(t, { passwordError: "auth/wrong-password" });
  await view.ready();
  view.enter("wrong-password");
  assert.equal(await view.verify(), false);
  assert.equal(view.errors.at(-1), "The password is incorrect. Please try again.");
  assert.ok(!view.calls.some(([kind]) => kind === "refresh"));
});

test("phone-only verification requests a fresh code only on Save, then confirms it on the next Save", async (t) => {
  const view = setup(t, { email: null, methods: [] });
  await view.ready();
  assert.match(view.html(), /\+1 \(519\) 555-0123/);
  assert.doesNotMatch(view.html(), /type="password"|type="tel"|type="email"|Continue|<form/);
  assert.deepEqual(view.calls, []);
  view.attachCaptcha();
  assert.equal(await view.verify(), false);
  assert.ok(view.calls.some(([kind, value]) => kind === "sms" && value === "+15195550123"));
  assert.match(view.html(), /autocomplete="one-time-code"/i);
  assert.ok(!view.calls.some(([kind]) => kind === "refresh"));
  view.enter("123456");
  assert.equal(await view.verify(), true);
  assert.deepEqual(view.calls.slice(-2), [
    ["confirm", "123456"],
    ["refresh", true],
  ]);
});

test("an account with both methods may choose its linked phone without entering another identifier", async (t) => {
  const view = setup(t);
  await view.ready();
  view.enter("discard-this-password");
  view.switch("Use SMS Code");
  assert.doesNotMatch(view.html(), /discard-this-password|type="email"|type="tel"/);
  view.attachCaptcha();
  assert.equal(await view.verify(), false);
  view.switch("Use Password");
  assert.match(view.html(), /type="password"/);
  assert.doesNotMatch(view.html(), /autocomplete="one-time-code"/i);
});

test("email-link-only users are not offered a password that has not been set", async (t) => {
  const view = setup(t, { methods: ["emailLink"], phone: null });
  await view.ready();
  assert.doesNotMatch(view.html(), /type="password"|Use SMS Code/);
  assert.match(view.html(), /Sign out and sign in again/);
  assert.equal(await view.verify(), false);
  assert.ok(!view.calls.some(([kind]) => ["password", "sms", "refresh"].includes(kind)));
});

test("method lookup failures fall back only to the current account's linked phone", async (t) => {
  const view = setup(t, { lookupError: "auth/network-request-failed" });
  await view.ready();
  assert.doesNotMatch(view.html(), /type="password"/);
  view.attachCaptcha();
  assert.equal(await view.verify(), false);
  assert.ok(
    view.calls.some(([kind, destination]) => kind === "sms" && destination === "+15195550123"),
  );
});

test("wrong or expired SMS codes do not refresh identity or permit the pending save", async (t) => {
  const view = setup(t, { email: null, methods: [], codeError: "auth/code-expired" });
  await view.ready();
  view.attachCaptcha();
  await view.verify();
  view.enter("123456");
  assert.equal(await view.verify(), false);
  assert.match(view.errors.at(-1), /expired/);
  assert.ok(!view.calls.some(([kind]) => kind === "refresh"));
});

test("switching accounts or changing the linked destination blocks stale verification", async (t) => {
  const view = setup(t);
  await view.ready();
  view.enter("password");
  view.auth.currentUser = { uid: "different-account" };
  assert.equal(await view.verify(), false);
  assert.match(view.errors.at(-1), /account changed/);
  assert.ok(!view.calls.some(([kind]) => ["password", "sms", "refresh"].includes(kind)));
  const phoneView = setup(t, { email: null, methods: [] });
  await phoneView.ready();
  phoneView.auth.currentUser.phoneNumber = "+15195550999";
  phoneView.attachCaptcha();
  assert.equal(await phoneView.verify(), false);
  assert.ok(!phoneView.calls.some(([kind]) => kind === "sms"));
});

test("repeated submissions cannot start duplicate verification attempts", async (t) => {
  let resolve;
  const delayedPassword = new Promise((finish) => {
    resolve = finish;
  });
  const view = setup(t, { delayedPassword });
  await view.ready();
  view.enter("password");
  const first = view.verify();
  assert.equal(await view.verify(), false);
  resolve();
  assert.equal(await first, true);
  assert.equal(view.calls.filter(([kind]) => kind === "password").length, 1);
});

test("cancellation during verification prevents a successful result from reaching the pending action", async (t) => {
  let resolve;
  const delayedPassword = new Promise((finish) => {
    resolve = finish;
  });
  const view = setup(t, { delayedPassword });
  await view.ready();
  view.enter("password");
  const verification = view.verify();
  view.unmount();
  resolve();
  assert.equal(await verification, false);
});
