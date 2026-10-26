import test from "node:test";
import assert from "node:assert/strict";
import { sendEmailLink } from "../src/components/auth/emailLink.ts";
import { writeStorage } from "../src/utils/storage.ts";

test("waits for sending to finish before remembering the trimmed email", async () => {
  let resolve!: () => void;
  const pending = new Promise<void>((done) => {
    resolve = done;
  });
  const remembered: string[] = [];
  const result = sendEmailLink(
    " person@example.com ",
    (email) => {
      assert.equal(email, "person@example.com");
      return pending;
    },
    (email) => {
      remembered.push(email);
    },
  );
  assert.deepEqual(remembered, []);
  resolve();
  await result;
  assert.deepEqual(remembered, ["person@example.com"]);
});

test("a failed send rejects without remembering a successful request", async () => {
  const failure = new Error("Network failed");
  await assert.rejects(
    sendEmailLink(
      "person@example.com",
      async () => {
        throw failure;
      },
      () => assert.fail("must not remember failed sends"),
    ),
    (error) => error === failure,
  );
});

test("invalid email never reaches Firebase", async () => {
  await assert.rejects(
    sendEmailLink(
      "invalid",
      async () => assert.fail("must not send"),
      () => assert.fail("must not remember"),
    ),
    { code: "auth/invalid-email" },
  );
});

test("a successful send stays successful when storage is blocked", async () => {
  await sendEmailLink(
    "person@example.com",
    async () => {},
    (email) =>
      writeStorage(
        () => {
          throw new Error("Storage blocked");
        },
        "signInEmail",
        email,
      ),
  );
});
