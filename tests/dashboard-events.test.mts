import test from "node:test";
import assert from "node:assert/strict";
import { formatDashboardEventDate, groupDashboardEvents } from "../src/utils/events.ts";

const timestamp = (iso: string) => ({ toDate: () => new Date(iso) });
const now = new Date("2026-11-14T20:00:00Z");
const record = (id: string, start: string, end?: string) => ({
  id,
  data: {
    title: id,
    start: timestamp(start),
    ...(end ? { end: timestamp(end) } : {}),
  },
});

test("event cards group upcoming nearest first and past most recent first", () => {
  const groups = groupDashboardEvents(
    [
      record("oldest", "2025-01-01T20:00:00Z"),
      record("later", "2026-12-01T20:00:00Z"),
      record("recent", "2026-11-13T20:00:00Z"),
      record("next", "2026-11-15T20:00:00Z"),
    ],
    now,
  );
  assert.deepEqual(
    groups.upcoming.map((event) => event.id),
    ["next", "later"],
  );
  assert.deepEqual(
    groups.past.map((event) => event.id),
    ["recent", "oldest"],
  );
});

test("ongoing events retain full details until their end time", () => {
  const groups = groupDashboardEvents(
    [
      record("ongoing", "2026-11-14T19:00:00Z", "2026-11-14T21:00:00Z"),
      record("ended", "2026-11-14T18:00:00Z", "2026-11-14T20:00:00Z"),
      record("no-end", "2026-11-14T19:00:00Z"),
      record("bad-end", "2026-11-14T19:00:00Z", "2026-11-14T18:00:00Z"),
    ],
    now,
  );
  assert.deepEqual(
    groups.upcoming.map((event) => event.id),
    ["ongoing"],
  );
  assert.equal(groups.past.length, 3);
});

test("invalid and missing dates remain available for correction", () => {
  const groups = groupDashboardEvents(
    [
      { id: "missing", data: { title: "Needs a date" } },
      { id: "invalid", data: { start: { toDate: () => new Date("invalid") } } },
    ],
    now,
  );
  assert.deepEqual(
    groups.undated.map((event) => event.id),
    ["missing", "invalid"],
  );
  assert.equal(groups.upcoming.length + groups.past.length, 0);
});

test("card dates use the Toronto date across midnight UTC", () => {
  assert.equal(formatDashboardEventDate(new Date("2026-11-15T02:00:00Z")), "Nov 14, 2026");
});

test("full card details reuse validation for links and public member notes", () => {
  const groups = groupDashboardEvents(
    [
      {
        id: "future",
        data: {
          title: "Concert",
          start: timestamp("2026-12-01T20:00:00Z"),
          members_note: "Bring your music",
          cancelled: true,
          links: [
            { text: "Venue", url: "https://example.com" },
            { text: "Unsafe", url: "javascript:alert(1)" },
          ],
        },
      },
    ],
    now,
  );
  const details = groups.upcoming[0].details!;
  assert.equal(details.membersNote, "Bring your music");
  assert.equal(details.cancelled, true);
  assert.equal(details.links.length, 1);
});
