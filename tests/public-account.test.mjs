import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent, loadSource } from "./helpers/components.mjs";
import { isAccountEnabled, parseFeature } from "../src/utils/features.ts";

for (const enabled of [false, true]) {
  test(`public account navigation ${enabled ? "opens the shared dashboard" : "stays hidden when disabled"}`, () => {
    const passThrough = { default: ({ children }) => children };
    const PublicApp = loadComponent("public/PublicApp", {
      react: {
        ...React,
        useState: (initial) => [
          Array.isArray(initial) ? [{ name: "account", enabled }] : initial,
          () => {},
        ],
        useEffect() {},
      },
      "../../utils/firebase": {},
      "../../utils/features": { isAccountEnabled, parseFeature },
      "../auth/AuthContext": { AuthProvider: passThrough.default },
      "../instruments/InstrumentLoadingContext": { InstrumentLoadingProvider: passThrough.default },
      "../instruments/DeviceOrientationContext": { DeviceOrientationProvider: passThrough.default },
      "../ThemeToggle": { default: () => React.createElement("button", null, "Theme") },
      "./HomePage": { default: () => React.createElement("main", { id: "main" }) },
      "./PublicApp.scss": {},
    }).default;
    const html = renderToStaticMarkup(React.createElement(PublicApp));
    assert.equal(html.includes('href="/dashboard/"'), enabled);
    assert.doesNotMatch(html, /href="#account"|sign-in-container|<form/);
  });
}

test("previous public email links reach the current dashboard flow without rendering the public app", () => {
  const redirects = [];
  let renders = 0;
  const dependencies = {
    react: React,
    "react-dom/client": { createRoot: () => ({ render: () => renders++ }) },
    "./components/public/PublicApp": { default: () => null },
  };
  const execute = (url) =>
    loadSource(new URL("../src/index.tsx", import.meta.url), dependencies, {
      document: { getElementById: () => ({}) },
      window: { location: { href: url, replace: (value) => redirects.push(value) } },
    });
  execute("https://actoncitizensband.ca/?mode=signIn&oobCode=old-code&apiKey=test-key#account");
  assert.deepEqual(redirects, [
    "https://actoncitizensband.ca/dashboard/?mode=signIn&oobCode=old-code&apiKey=test-key",
  ]);
  assert.equal(renders, 0);
  execute("https://actoncitizensband.ca/?utm_source=facebook#events");
  execute("https://actoncitizensband.ca/?mode=signIn");
  assert.equal(renders, 2);
  assert.equal(redirects.length, 1);
});
