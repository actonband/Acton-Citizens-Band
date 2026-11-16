import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import registration from "../functions/registration.cjs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./helpers/components.mjs";

const source = readFileSync(new URL("../functions/index.cjs", import.meta.url), "utf8");

function setup({ authError, failCleanup = false, alias = false, linking = false } = {}) {
  const operations = [];
  let fail = failCleanup;
  class HttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }
  const region = {
    https: { onCall: (handler) => handler },
    runWith: (options) => {
      assert.equal(options.failurePolicy, true);
      return { auth: { user: () => ({ onDelete: (handler) => handler }) } };
    },
  };
  const dependencies = {
    "./registration.cjs": registration,
    "firebase-functions/v1": {
      region: (name) => {
        assert.equal(name, "northamerica-northeast1");
        return region;
      },
      https: { HttpsError },
      logger: { error: () => {} },
    },
    "firebase-admin/app": { initializeApp: () => {} },
    "firebase-admin/auth": {
      getAuth: () => ({
        deleteUser: async (uid) => {
          operations.push(["deleteAuth", uid]);
          if (authError) throw { code: authError };
        },
      }),
    },
    "firebase-admin/firestore": {
      getFirestore: () => ({
        doc: (path) => ({
          path,
          get: async () => ({
            data: () =>
              path.startsWith("users/") && alias
                ? { merged_into: "canonical" }
                : path.startsWith("access/") && linking
                  ? { linking: true }
                  : {},
          }),
        }),
        collection: () => ({ where: () => ({ get: async () => ({ docs: [] }) }) }),
        batch: () => {
          const writes = [];
          return {
            delete: (ref) => writes.push(["delete", ref.path]),
            set: (ref, data) => writes.push(["set", ref.path, { ...data }]),
            commit: async () => {
              operations.push(["commit", writes]);
              if (fail) {
                fail = false;
                throw new Error("Offline");
              }
            },
          };
        },
      }),
    },
  };
  const context = {
    exports: {},
    require: (name) => {
      assert.ok(dependencies[name]);
      return dependencies[name];
    },
    Date: { now: () => 10000000 },
  };
  vm.runInNewContext(source, context);
  return { handlers: context.exports, operations };
}

const signedIn = { auth: { uid: "own-account", token: { auth_time: 9999 } } };

for (const verified of [false, true]) {
  test(`deletion verification shares the existing confirmation button and ${verified ? "completes only after proof" : "blocks deletion without proof"}`, async () => {
    const state = [];
    let cursor = 0;
    const calls = [];
    let deleted = 0;
    let verifications = 0;
    const View = loadComponent("profile/DeleteAccount", {
      react: {
        ...React,
        useState(initial) {
          const index = cursor++;
          if (!(index in state)) state[index] = initial;
          return [
            state[index],
            (next) => {
              state[index] = next;
            },
          ];
        },
        useRef(initial) {
          const index = cursor++;
          return (state[index] ||= { current: initial });
        },
      },
      "firebase/functions": {
        getFunctions: () => ({}),
        httpsCallable: (_functions, name) => {
          assert.equal(name, "manageDashboardUser");
          return async (request) => {
            calls.push(request);
            if (calls.length === 1) throw { code: "functions/failed-precondition" };
            return { data: { deleted: true } };
          };
        },
      },
      "firebase/auth": {
        signOut: async () => {
          throw new Error("Administrator should stay signed in");
        },
      },
      "../../utils/firebase": {
        firebaseApp: {},
        firebaseAuth: { currentUser: { getIdToken: async () => "test-token" } },
      },
      "../../utils/analytics": {
        measureDashboardAction: (_name, operation) => operation(),
        setAnalyticsUserId() {},
      },
      "../dashboard/users/adminUsers": { adminUserError: () => "Error" },
      "../auth/IdentityVerification": {
        default: React.forwardRef(({ onError }, ref) => {
          ref.current = {
            verify: async () => {
              verifications++;
              if (!verified) onError("Verification incomplete.");
              return verified;
            },
          };
          return React.createElement("p", null, "Verify identity fields");
        }),
      },
    }).default;
    const render = () => {
      cursor = 0;
      return View({ target: { uid: "target", name: "Member" }, onDeleted: () => deleted++ });
    };
    function find(node, predicate) {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) return node.map((item) => find(item, predicate)).find(Boolean);
      return predicate(node) ? node : find(node.props?.children, predicate);
    }
    find(render(), (node) => node.type === "button").props.onClick();
    find(render(), (node) => node.type === "input").props.onChange({ target: { value: "DELETE" } });
    await find(render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
    const html = renderToStaticMarkup(render());
    assert.ok(html.indexOf("Verify identity fields") < html.indexOf("Permanently Delete User"));
    assert.equal((html.match(/<form\b/g) || []).length, 1);
    await find(render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
    assert.equal(verifications, 1);
    assert.equal(calls.length, verified ? 2 : 1);
    assert.equal(deleted, verified ? 1 : 0);
    if (verified)
      assert.deepEqual(calls[1], { confirmation: "DELETE", action: "delete", uid: "target" });
  });
}

test("deletion requires authentication, confirmation and a recent sign-in", async () => {
  const { handlers, operations } = setup();
  for (const [data, context, expected] of [
    [{ confirmation: "DELETE" }, {}, "unauthenticated"],
    [{ confirmation: "delete" }, signedIn, "invalid-argument"],
    [
      { confirmation: "DELETE" },
      { auth: { uid: "own-account", token: { auth_time: 9000 } } },
      "failed-precondition",
    ],
    [
      { confirmation: "DELETE" },
      { auth: { uid: "own-account", token: {} } },
      "failed-precondition",
    ],
    [
      { confirmation: "DELETE" },
      { auth: { uid: "own-account", token: { auth_time: 11000 } } },
      "failed-precondition",
    ],
  ])
    await assert.rejects(
      () => handlers.deleteDashboardAccount(data, context),
      (error) => error.code === expected,
    );
  assert.equal(operations.length, 0);
});

test("deleting a redundant Auth identity preserves its profile redirect", async () => {
  const fixture = setup({ alias: true });
  await fixture.handlers.cleanupDeletedDashboardAccount({ uid: "redundant" });
  assert.deepEqual(fixture.operations, []);
});

test("account deletion waits for an active contact connection", async () => {
  const fixture = setup({ linking: true });
  await assert.rejects(
    () => fixture.handlers.deleteDashboardAccount({ confirmation: "DELETE" }, signedIn),
    (error) => error.code === "failed-precondition",
  );
  assert.deepEqual(fixture.operations, []);
});

test("deletion targets the authenticated UID and removes profile and permission details", async () => {
  const { handlers, operations } = setup();
  const result = await handlers.deleteDashboardAccount(
    { confirmation: "DELETE", uid: "another-account" },
    signedIn,
  );
  assert.equal(result.deleted, true);
  assert.equal(result.cleanupPending, false);
  assert.deepEqual(operations, [
    ["deleteAuth", "own-account"],
    [
      "commit",
      [
        ["delete", "users/own-account"],
        ["set", "access/own-account", { deleted: true }],
      ],
    ],
  ]);
});

test("an Auth deletion failure preserves the profile and permissions", async () => {
  const { handlers, operations } = setup({ authError: "auth/internal-error" });
  await assert.rejects(() => handlers.deleteDashboardAccount({ confirmation: "DELETE" }, signedIn));
  assert.deepEqual(operations, [["deleteAuth", "own-account"]]);
});

test("retrying a request after Auth deletion still cleans up profile data", async () => {
  const { handlers } = setup({ authError: "auth/user-not-found" });
  const result = await handlers.deleteDashboardAccount({ confirmation: "DELETE" }, signedIn);
  assert.equal(result.deleted, true);
  assert.equal(result.cleanupPending, false);
});

test("cleanup failures are recoverable through the retryable deletion trigger", async () => {
  const { handlers, operations } = setup({ failCleanup: true });
  const result = await handlers.deleteDashboardAccount({ confirmation: "DELETE" }, signedIn);
  assert.equal(result.deleted, true);
  assert.equal(result.cleanupPending, true);
  await handlers.cleanupDeletedDashboardAccount({ uid: "own-account" });
  await handlers.cleanupDeletedDashboardAccount({ uid: "own-account" });
  assert.equal(operations.filter((item) => item[0] === "deleteAuth").length, 1);
  assert.equal(operations.filter((item) => item[0] === "commit").length, 3);
});
