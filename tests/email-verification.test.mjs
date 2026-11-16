import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./helpers/components.mjs";

function setup({ send = async () => {}, refresh = async () => {} } = {}) {
  const calls = [];
  const module = loadComponent("auth/EmailVerification", {
    react: { ...React, useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() },
    "firebase/auth": {
      reload: async (user) => {
        calls.push(["reload", user.uid]);
        await refresh(user);
      },
      sendEmailVerification: async (user) => {
        calls.push(["send", user.uid]);
        await send(user);
      },
    },
  });
  const user = { uid: "current-account", email: "member@example.com", emailVerified: false };
  const tree = (account = user) => module.default({ user: account });
  function findButton(element) {
    if (!element || typeof element !== "object") return;
    if (Array.isArray(element)) return element.map(findButton).find(Boolean);
    if (element.type === "button") return element;
    return findButton(element.props?.children);
  }
  return {
    user,
    calls,
    request: module.requestVerificationEmail,
    html: (account) => renderToStaticMarkup(tree(account)),
    async resend() {
      findButton(tree()).props.onClick();
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

test("automatic delivery feedback survives the sign-up handoff and concurrent sends share one request", async () => {
  let finish;
  const pending = new Promise((resolve) => (finish = resolve));
  const view = setup({ send: () => pending });
  const first = view.request(view.user);
  assert.equal(view.request(view.user), first);
  assert.match(view.html(), /Sending/);
  assert.match(view.html(), /disabled/);
  assert.doesNotMatch(view.html(), /Verification email sent/);
  finish();
  await first;
  assert.deepEqual(view.calls, [["send", "current-account"]]);
  assert.match(view.html(), /Verification email sent/);
  assert.match(view.html(), /Resend Verification Email/);
});

test("resend failures remain visible and retry without re-creating the account", async () => {
  let attempts = 0;
  const view = setup({
    send: async () => {
      if (++attempts === 1) throw new Error("Private SDK details");
    },
  });
  await view.request(view.user);
  assert.match(view.html(), /role="alert"/);
  assert.match(view.html(), /Unable to send/);
  assert.doesNotMatch(view.html(), /Private SDK details|Verification email sent/);
  await view.resend();
  assert.deepEqual(view.calls, [
    ["send", "current-account"],
    ["reload", "current-account"],
    ["send", "current-account"],
  ]);
  assert.match(view.html(), /role="status"/);
  assert.match(view.html(), /Verification email sent/);
  assert.doesNotMatch(view.html(), /Unable to send/);
});

test("resend refreshes verification first and avoids sending after the link was already used", async () => {
  const view = setup({ refresh: async (user) => (user.emailVerified = true) });
  await view.resend();
  assert.deepEqual(view.calls, [["reload", "current-account"]]);
  assert.equal(view.html(), "");
});

test("verified accounts and phone-only accounts never show or send an email verification", async () => {
  const view = setup();
  for (const account of [
    { ...view.user, emailVerified: true },
    { ...view.user, email: null },
  ]) {
    assert.equal(view.html(account), "");
    await view.request(account);
  }
  assert.deepEqual(view.calls, []);
});

test("verification throttling explains why another send must wait", async () => {
  const view = setup({
    send: async () => {
      throw { code: "auth/too-many-requests" };
    },
  });
  await view.request(view.user);
  assert.match(view.html(), /Too many verification requests/);
  assert.match(view.html(), /Please wait/);
});

test("delivery errors stay scoped to the account whose request failed", async () => {
  const view = setup({
    send: async () => {
      throw new Error("Offline");
    },
  });
  await view.request(view.user);
  assert.match(view.html(), /Unable to send/);
  const other = { ...view.user, uid: "different-account", email: "other@example.com" };
  assert.match(view.html(other), /Resend Verification Email/);
  assert.doesNotMatch(view.html(other), /Unable to send|Verification email sent/);
});
