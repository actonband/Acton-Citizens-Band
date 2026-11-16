import test from "node:test";
import assert from "node:assert/strict";
import { bindAnalyticsIdentity } from "../src/utils/analyticsIdentity.ts";

test("identity clears on switches, missing/deleted/linking accounts and errors; stale reads cannot restore it", () => {
  let auth!: (uid: string | null) => void;
  const watchers: {
    uid: string;
    next: (data: Record<string, unknown> | null) => void;
    error: () => void;
    stopped: boolean;
  }[] = [];
  const assigned: unknown[] = [];
  let authStopped = false;
  const stop = bindAnalyticsIdentity(
    (next) => {
      auth = next;
      return () => {
        authStopped = true;
      };
    },
    (uid, next, error) => {
      const watcher = { uid, next, error, stopped: false };
      watchers.push(watcher);
      return () => {
        watcher.stopped = true;
      };
    },
    (id) => assigned.push(id ?? null),
  );
  auth("first-auth-uid");
  watchers[0].next({ analyticsId: "first-opaque-id" });
  assert.equal(assigned[assigned.length - 1], "first-opaque-id");
  auth("second-auth-uid");
  assert.equal(assigned[assigned.length - 1], null);
  assert.equal(watchers[0].stopped, true);
  watchers[0].next({ analyticsId: "stale" });
  assert.equal(assigned[assigned.length - 1], null);
  for (const account of [
    { analyticsId: "second" },
    { analyticsId: "second", deleted: true },
    { analyticsId: "second", linking: true },
    {},
    null,
  ]) {
    watchers[1].next(account);
    assert.equal(
      assigned[assigned.length - 1],
      account?.analyticsId && !account.deleted && !account.linking ? "second" : null,
    );
  }
  watchers[1].next({ analyticsId: "second" });
  watchers[1].error();
  assert.equal(assigned[assigned.length - 1], null);
  auth(null);
  watchers[1].next({ analyticsId: "late" });
  assert.equal(assigned[assigned.length - 1], null);
  auth("third-auth-uid");
  stop();
  watchers[2].next({ analyticsId: "after-unmount" });
  assert.equal(assigned[assigned.length - 1], null);
  assert.equal(authStopped, true);
  assert.equal(watchers[2].stopped, true);
  assert.ok(!assigned.includes("first-auth-uid"));
});
