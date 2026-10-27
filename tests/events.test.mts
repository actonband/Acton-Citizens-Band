import test from "node:test";
import assert from "node:assert/strict";
import { parseEvent, formatEventDate, formatEventTime } from "../src/utils/events.ts";
const timestamp = (iso: string) => ({ toDate: () => new Date(iso) });

test("rejects missing, invalid and throwing timestamps", () => {
  for (const start of [
    null,
    "2026-01-01",
    {},
    { toDate: () => "invalid" },
    timestamp("invalid"),
    {
      toDate: () => {
        throw new Error("bad data");
      },
    },
  ]) {
    assert.equal(parseEvent("id", { start }), null);
  }
});
test("validates optional fields and keeps the document ID authoritative", () => {
  const event = parseEvent("real-id", {
    id: "wrong-id",
    start: timestamp("2026-07-01T23:30:00Z"),
    title: " Concert ",
    venue: 42,
    end: timestamp("invalid"),
    cancelled: "false",
    members_note: " Public note ",
    links: "wrong shape",
  });
  assert.ok(event);
  assert.equal(event.id, "real-id");
  assert.equal(event.title, "Concert");
  assert.equal(event.venue, "");
  assert.equal(event.membersNote, "Public note");
  assert.equal(event.end, null);
  assert.equal(event.cancelled, false);
  assert.deepEqual(event.links, []);
});
test("keeps only valid HTTP(S) event links", () => {
  const event = parseEvent("id", {
    start: timestamp("2026-07-01T23:30:00Z"),
    links: [
      null,
      {},
      { text: "Bad", url: "javascript:alert(1)" },
      { text: " ", url: "https://example.com" },
      { text: "Tickets", url: "https://example.com/tickets" },
    ],
  });
  assert.deepEqual(event?.links, [{ text: "Tickets", url: "https://example.com/tickets" }]);
});
test("formats the Acton calendar date across midnight UTC", () => {
  assert.match(formatEventDate(new Date("2026-07-02T01:30:00Z")), /Jul 1, 2026/);
});
test("ignores an end timestamp earlier than the event starts", () => {
  const event = parseEvent("id", {
    start: timestamp("2026-12-05T19:00:00Z"),
    end: timestamp("2026-12-05T18:00:00Z"),
  });
  assert.equal(event?.end, null);
});
test("uses Toronto daylight saving and winter offsets", () => {
  assert.match(formatEventTime(new Date("2026-07-01T23:30:00Z")), /7:30/);
  assert.match(formatEventTime(new Date("2026-01-01T23:30:00Z")), /6:30/);
});
