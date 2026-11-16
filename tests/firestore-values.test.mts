import test from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import { Bytes, GeoPoint, Timestamp, doc, getFirestore } from "firebase/firestore";
import { firestoreValuesEqual } from "../src/utils/firestoreValues.ts";

test("unchanged event documents compare equal despite map/property ordering", () => {
  const opened = {
    title: "Concert",
    updated: new Timestamp(1000, 42),
    user_id: "/users/admin",
    links: [{ text: "Venue", url: "https://example.com" }],
  };
  const current = {
    links: [{ url: "https://example.com", text: "Venue" }],
    user_id: "/users/admin",
    updated: new Timestamp(1000, 42),
    title: "Concert",
  };
  assert.notEqual(JSON.stringify(opened), JSON.stringify(current));
  assert.equal(firestoreValuesEqual(opened, current), true);
});

test("changed event values, added/removed fields and link ordering remain real conflicts", () => {
  const opened = { title: "Concert", updated: new Timestamp(1000, 42), links: ["one", "two"] };
  for (const current of [
    { ...opened, title: "Renamed" },
    { ...opened, updated: new Timestamp(1000, 43) },
    { ...opened, links: ["two", "one"] },
    { ...opened, cancelled: true },
    { title: opened.title, links: opened.links },
  ])
    assert.equal(firestoreValuesEqual(opened, current), false);
});

test("Firestore timestamps retain nanosecond precision and differ from plain maps", () => {
  assert.equal(firestoreValuesEqual(new Timestamp(1000, 1), new Timestamp(1000, 1)), true);
  assert.equal(firestoreValuesEqual(new Timestamp(1000, 1), new Timestamp(1000, 2)), false);
  assert.equal(
    firestoreValuesEqual(new Timestamp(1000, 1), { seconds: 1000, nanoseconds: 1 }),
    false,
  );
});

test("Firestore references compare by document identity without serializing SDK internals", async () => {
  const app = initializeApp({ projectId: "demo-event-conflicts" }, "event-conflict-test");
  try {
    const db = getFirestore(app);
    assert.equal(firestoreValuesEqual(doc(db, "users/one"), doc(db, "users/one")), true);
    assert.equal(firestoreValuesEqual(doc(db, "users/one"), doc(db, "users/two")), false);
  } finally {
    await deleteApp(app);
  }
});

test("Firestore byte/coordinate values and scalar edge cases preserve type and value", () => {
  assert.equal(firestoreValuesEqual(new GeoPoint(43, -80), new GeoPoint(43, -80)), true);
  assert.equal(firestoreValuesEqual(new GeoPoint(43, -80), new GeoPoint(44, -80)), false);
  assert.equal(
    firestoreValuesEqual(
      Bytes.fromUint8Array(new Uint8Array([1, 2])),
      Bytes.fromUint8Array(new Uint8Array([1, 2])),
    ),
    true,
  );
  assert.equal(
    firestoreValuesEqual(
      Bytes.fromUint8Array(new Uint8Array([1, 2])),
      Bytes.fromUint8Array(new Uint8Array([1, 3])),
    ),
    false,
  );
  assert.equal(firestoreValuesEqual(NaN, NaN), true);
  assert.equal(firestoreValuesEqual(NaN, null), false);
  assert.equal(firestoreValuesEqual({ field: null }, {}), false);
});
