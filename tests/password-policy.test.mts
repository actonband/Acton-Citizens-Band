import test from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
// The Node Auth build captures fetch at import time; install a test transport first.
const originalFetch = globalThis.fetch;
let transport: typeof fetch;
globalThis.fetch = (...args) => transport(...args);
const { getAuth, validatePassword } = await import("firebase/auth");
const { passwordCriteria, validateNewPassword } = await import("../src/utils/passwordPolicy.ts");
globalThis.fetch = originalFetch;

async function fixture(
  policy: object,
  run: (
    auth: ReturnType<typeof getAuth>,
    requests: { url: string; method: unknown; body: unknown }[],
  ) => Promise<void>,
) {
  const requests: { url: string; method: unknown; body: unknown }[] = [];
  transport = async (input, options) => {
    requests.push({ url: String(input), method: options?.method, body: options?.body });
    return new Response(JSON.stringify(policy), { status: 200 });
  };
  const app = initializeApp(
    { apiKey: "test-password-policy", projectId: "policy-tests" },
    crypto.randomUUID(),
  );
  try {
    await run(getAuth(app), requests);
  } finally {
    await deleteApp(app);
  }
}
test("Firebase policy produces live, required-only checks without sending candidate passwords", async () => {
  await fixture(
    {
      schemaVersion: 1,
      enforcementState: "ENFORCE",
      customStrengthOptions: {
        minPasswordLength: 12,
        maxPasswordLength: 30,
        containsLowercaseCharacter: true,
        containsUppercaseCharacter: true,
        containsNumericCharacter: true,
        containsNonAlphanumericCharacter: true,
      },
      allowedNonAlphanumericCharacters: ["!", "@", "#"],
    },
    async (auth, requests) => {
      const short = await validatePassword(auth, "short");
      const criteria = passwordCriteria(short);
      assert.equal(short.isValid, false);
      assert.equal(criteria.length, 6);
      assert.equal(
        criteria.find((item) => item.key === "minimum")?.label,
        "At least 12 characters",
      );
      assert.equal(criteria.find((item) => item.key === "containsLowercaseLetter")?.met, true);
      assert.equal(criteria.find((item) => item.key === "containsUppercaseLetter")?.met, false);
      await assert.rejects(validateNewPassword(auth, "short"), {
        code: "auth/password-does-not-meet-requirements",
      });
      const valid = await validateNewPassword(auth, "SyntheticTest!123");
      assert.ok(valid.isValid);
      assert.ok(passwordCriteria(valid).every((item) => item.met));
      await assert.rejects(validateNewPassword(auth, "SyntheticTest-123"), {
        code: "auth/password-does-not-meet-requirements",
      });
      assert.equal(requests.length, 1);
      assert.equal(requests[0].method, "GET");
      assert.equal(requests[0].body, undefined);
      assert.ok(requests[0].url.includes("/v2/passwordPolicy"));
      assert.ok(!requests[0].url.includes("SyntheticTest"));
    },
  );
});
test("Firebase defaults do not invent uppercase, numeric or symbol requirements", async () => {
  await fixture(
    { schemaVersion: 1, enforcementState: "OFF", customStrengthOptions: {} },
    async (auth) => {
      const status = await validateNewPassword(auth, "abcdef");
      assert.deepEqual(passwordCriteria(status), [
        { key: "minimum", label: "At least 6 characters", met: true },
      ]);
    },
  );
});
test("policy retrieval failure prevents submission instead of assuming a minimum", async () => {
  transport = async () =>
    new Response(JSON.stringify({ error: { message: "UNAVAILABLE" } }), { status: 503 });
  const app = initializeApp(
    { apiKey: "test-policy-offline", projectId: "policy-tests" },
    crypto.randomUUID(),
  );
  try {
    await assert.rejects(validateNewPassword(getAuth(app), "SyntheticTest!123"), {
      code: "auth/password-policy-unavailable",
    });
  } finally {
    await deleteApp(app);
  }
});
