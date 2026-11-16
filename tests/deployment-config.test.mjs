import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const config = JSON.parse(read("../firebase.json"));
const main = read("../.github/workflows/firebase-hosting-merge.yml");
const preview = read("../.github/workflows/firebase-hosting-pull-request.yml");

test("merge deployment includes the local rules and all account functions before Hosting", () => {
  assert.equal(config.firestore.rules, "firestore.rules");
  const functions = config.functions.find((item) => item.source === "functions");
  const pkg = JSON.parse(read("../functions/package.json"));
  assert.equal(functions.runtime, `nodejs${pkg.engines.node}`);
  const exported = [...read("../functions/index.cjs").matchAll(/exports\.(\w+)\s*=/g)].map(
    (match) => match[1],
  );
  for (const name of exported)
    assert.ok(
      main.includes(`--only functions:${functions.codebase}:${name} --project acton-citizens-band`),
    );
  const rules = main.indexOf("--only firestore:rules --project acton-citizens-band");
  const cleanup = main.indexOf(
    `--only functions:${functions.codebase}:cleanupDeletedDashboardAccount`,
  );
  const endpoint = main.indexOf(`--only functions:${functions.codebase}:deleteDashboardAccount`);
  const management = main.indexOf(`--only functions:${functions.codebase}:manageDashboardUser`);
  const hosting = main.indexOf("FirebaseExtended/action-hosting-deploy");
  assert.ok(
    rules > 0 &&
      rules < cleanup &&
      cleanup < endpoint &&
      endpoint < management &&
      management < hosting,
  );
  assert.match(main, /concurrency:[\s\S]*group: firebase-production/);
});

test("both workflows validate server dependencies while PR deployment stays Hosting-only", () => {
  for (const workflow of [main, preview]) {
    assert.ok(workflow.includes("npm ci --prefix functions"));
    assert.ok(workflow.includes("node functions/index.cjs"));
    assert.ok(workflow.includes("node --test tests/account-deletion.test.mjs"));
    assert.ok(workflow.includes("node --test tests/admin-users.test.mjs"));
    assert.ok(workflow.includes("node --test tests/registration.test.mjs"));
    assert.match(workflow, /node-version: "22"/);
  }
  assert.doesNotMatch(preview, /firebase deploy --only (?:firestore|functions)/);
});
