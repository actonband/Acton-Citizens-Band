import assert from "node:assert/strict";
import test from "node:test";
import { formatPhoneNumber, normalizePhoneNumber, phoneNumberError } from "../src/utils/phone.ts";

test("ten-digit phone numbers receive the default +1 country code", () => {
  for (const input of [
    "5195550123",
    "519-555-0123",
    " (519) 555.0123 ",
    "[519] 555-0123",
    "{519} 555–0123",
    "(519)\u00a0555‑0123",
    "519/555/0123",
    "<519>_555|0123",
    "Call: 519 555 0123",
  ]) {
    assert.equal(normalizePhoneNumber(input), "+15195550123");
  }
});

test("existing country codes are preserved without duplicate prefixes", () => {
  assert.equal(normalizePhoneNumber("1 (519) 555-0123"), "+15195550123");
  assert.equal(normalizePhoneNumber("+1 519 555 0123"), "+15195550123");
  assert.equal(normalizePhoneNumber("+44 20 7946 0958"), "+442079460958");
  assert.equal(normalizePhoneNumber("+61 412 345 678"), "+61412345678");
  assert.equal(normalizePhoneNumber("++1/[519]/555_0123"), "+15195550123");
  assert.equal(normalizePhoneNumber(" +44/20/7946/0958 "), "+442079460958");
  assert.equal(normalizePhoneNumber("+44 2079 4609"), "+4420794609");
});

test("ambiguous lengths and malformed phone entries require correction", () => {
  for (const input of [
    "",
    "5550123",
    "519555012",
    "442079460958",
    "519CALLNOW",
    "5195550123 ext 4",
    "+01234567890",
    "+1234567890123456",
    "+1519555012",
    "+151955501234",
  ]) {
    assert.equal(normalizePhoneNumber(input), null, input);
  }
});

test("North American numbers display the country code, area code and local number", () => {
  for (const input of ["5195550123", "[519] 555-0123", "1 (519) 555 0123", "+15195550123"])
    assert.equal(formatPhoneNumber(input), "+1 (519) 555-0123");
  assert.equal(formatPhoneNumber(formatPhoneNumber("5195550123")), "+1 (519) 555-0123");
});

test("formatted display numbers normalize back to the exact SMS destination", () => {
  for (const input of ["[519] 555-0123", "1 (519) 555–0123", "+44 (20) 7946-0958"])
    assert.equal(normalizePhoneNumber(formatPhoneNumber(input)), normalizePhoneNumber(input));
  assert.equal(formatPhoneNumber("+44 (20) 7946-0958"), "+442079460958");
});

test("formatting leaves incomplete or invalid input untouched for correction", () => {
  for (const input of ["", "519", "[519] 555", "member@example.com", "5195550123 ext 4"])
    assert.equal(formatPhoneNumber(input), input);
});

test("country-code prompts appear only for bare numbers with a non-default digit count", () => {
  for (const input of [
    "5195550123",
    "[519] 555-0123",
    "15195550123",
    "+1 (519) 555-0123",
    "+44 20 7946 0958",
  ])
    assert.equal(phoneNumberError(input), "");
  for (const input of ["5550123", "(519) 555-012", "442079460958", "519CALLNOW"])
    assert.equal(phoneNumberError(input), "Include your country code, starting with +.");
  for (const input of ["letters only", "+0123456789", "+151955501234"])
    assert.equal(phoneNumberError(input), "Enter a valid phone number.");
  assert.equal(phoneNumberError(""), "Enter your phone number.");
});
