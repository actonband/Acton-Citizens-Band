import test from "node:test";
import assert from "node:assert/strict";
import { validateEventLinks } from "../src/utils/events.ts";

test("event links trim values, preserve delimiters and ignore entirely empty drafts", () => {
  assert.deepEqual(
    validateEventLinks([
      { text: " Tickets | Information ", url: " https://example.com/?a=1&b=2 " },
      { text: " ", url: " " },
    ]),
    [{ text: "Tickets | Information", url: "https://example.com/?a=1&b=2" }],
  );
  assert.deepEqual(validateEventLinks([]), []);
});
test("partial, malformed and unsafe links are rejected with their row number", () => {
  for (const link of [
    { text: "", url: "https://example.com" },
    { text: "Venue", url: "" },
    { text: "Venue", url: "javascript:alert(1)" },
    { text: "Venue", url: "ftp://example.com" },
    { text: "Venue", url: "example.com" },
    { text: "Venue", url: "https://" },
  ])
    assert.throws(
      () => validateEventLinks([{ text: "Safe", url: "http://example.com" }, link]),
      /Link 2:/,
    );
});
test("event link count matches the existing 20-link Firestore limit", () => {
  const links = Array.from({ length: 20 }, (_, index) => ({
    text: `Link ${index}`,
    url: "https://example.com",
  }));
  assert.equal(validateEventLinks(links).length, 20);
  assert.throws(() => validateEventLinks([...links, links[0]]), /up to 20 links/);
});
