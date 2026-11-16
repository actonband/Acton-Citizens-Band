import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const config = require("../webpack.config.cjs");

test("local email action URLs use the dashboard entry", () => {
  const rewrites = config.devServer.historyApiFallback.rewrites;
  for (const pathname of ["/__/auth/action", "/__/auth/action/", "/dashboard", "/dashboard/"]) {
    assert.equal(rewrites.find((rule) => rule.from.test(pathname))?.to, "/dashboard/index.html");
  }
  for (const pathname of ["/", "/calendar", "/unrelated"]) {
    assert.equal(
      rewrites.find((rule) => rule.from.test(pathname)),
      undefined,
    );
  }
});

test("dashboard scripts are confined to the dashboard HTML entry", () => {
  const pages = config.plugins.filter((plugin) => plugin.constructor.name === "HtmlWebpackPlugin");
  assert.deepEqual(
    pages.find((page) => page.userOptions.filename === "index.html").userOptions.chunks,
    ["main"],
  );
  assert.deepEqual(
    pages.find((page) => page.userOptions.filename === "dashboard/index.html").userOptions.chunks,
    ["dashboard"],
  );
});
