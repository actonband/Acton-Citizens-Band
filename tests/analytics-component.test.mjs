import test from "node:test";
import assert from "node:assert/strict";
import { loadComponent } from "./helpers/components.mjs";
import { bindAnalyticsIdentity } from "../src/utils/analyticsIdentity.ts";

for (const enabled of [false, true]) {
  test(`shared Analytics ${enabled ? "watches only the signed-in account mapping and cleans up" : "makes no Auth or Firestore requests when excluded"}`, () => {
    const operations = [];
    const effects = [];
    const auth = {};
    const db = {};
    let authChanged;
    let accountChanged;

    const dependencies = {
      react: { useEffect: (effect) => effects.push(effect) },
      "firebase/auth": {
        onAuthStateChanged(instance, next) {
          assert.equal(instance, auth);
          operations.push("watch_auth");
          authChanged = next;
          return () => operations.push("stop_auth");
        },
      },
      "firebase/firestore": {
        doc(database, collection, uid) {
          assert.equal(database, db);
          assert.equal(collection, "access");
          assert.equal(uid, "signed-in-uid");
          operations.push("read_own_access");
          return {};
        },
        onSnapshot(_ref, next) {
          accountChanged = next;
          return () => operations.push("stop_access");
        },
      },
      "../utils/firebase": { firebaseAuth: auth, firestore: db },
      "../utils/analyticsIdentity": { bindAnalyticsIdentity },
      "../utils/analytics": {
        default: {
          initGoogleAnalytics() {
            operations.push("initialize");
            return () => operations.push("cleanup_analytics");
          },
        },
        analyticsEnabled: () => enabled,
        setAnalyticsUserId: (value) => operations.push(["identity", value ?? null]),
      },
    };
    const componentExports = loadComponent(
      "Analytics",
      (name) => {
        assert.ok(dependencies[name], `Unexpected dependency: ${name}`);
        return dependencies[name];
      },
      {},
    );
    assert.equal(componentExports.default(), null);
    const cleanup = effects[0]();
    if (!enabled) {
      assert.deepEqual(operations, []);
      return;
    }
    authChanged({ uid: "signed-in-uid", email: "private@example.com" });
    accountChanged({ exists: () => true, data: () => ({ analyticsId: "opaque-id", admin: true }) });
    assert.deepEqual(operations.at(-1), ["identity", "opaque-id"]);
    authChanged(null);
    assert.deepEqual(operations.at(-1), ["identity", null]);
    accountChanged({ exists: () => true, data: () => ({ analyticsId: "stale-id" }) });
    assert.deepEqual(operations.at(-1), ["identity", null]);
    cleanup();
    assert.deepEqual(operations.slice(-3), ["stop_auth", ["identity", null], "cleanup_analytics"]);
    assert.doesNotMatch(JSON.stringify(operations), /private@example.com|signed-in-uid|stale-id/);
  });
}
