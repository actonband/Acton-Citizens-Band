import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./helpers/components.mjs";

const require = createRequire(import.meta.url);

function setup(t, { saved = null, dark = false, blocked = false, props = {} } = {}) {
  const originals = Object.fromEntries(
    ["window", "document", "localStorage"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const storageEvents = new Set();
  const mediaEvents = new Set();
  const preference = {
    matches: dark,
    addEventListener: (_type, callback) => mediaEvents.add(callback),
    removeEventListener: (_type, callback) => mediaEvents.delete(callback),
  };
  const document = { documentElement: { dataset: { theme: dark ? "dark" : "light" } } };
  const storage = {
    getItem: () => {
      if (blocked) throw Error("Blocked");
      return saved;
    },
    setItem: (key, value) => {
      assert.equal(key, "acb-theme");
      if (blocked) throw Error("Blocked");
      saved = value;
    },
  };
  for (const [key, value] of Object.entries({
    document,
    localStorage: storage,
    window: {
      matchMedia: () => preference,
      addEventListener: (_type, callback) => storageEvents.add(callback),
      removeEventListener: (_type, callback) => storageEvents.delete(callback),
    },
  }))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const state = [];
  let cursor = 0;
  let cleanup;

  const componentExports = loadComponent(
    "ThemeToggle",
    (name) =>
      name.endsWith("/utils/analytics")
        ? { trackEvent() {} }
        : name !== "react"
          ? require(name)
          : {
              useState(initial) {
                const index = cursor++;
                if (!(index in state))
                  state[index] = typeof initial === "function" ? initial() : initial;
                return [
                  state[index],
                  (next) => {
                    state[index] = next;
                  },
                ];
              },
              useRef(initial) {
                const index = cursor++;
                return (state[index] ||= { current: initial });
              },
              useEffect(effect) {
                const index = cursor++;
                if (!state[index]) {
                  state[index] = true;
                  cleanup = effect();
                }
              },
            },
    {},
  );
  const render = () => {
    cursor = 0;
    return componentExports.default(props);
  };
  t.after(() => {
    cleanup?.();
    assert.equal(mediaEvents.size, 0);
    assert.equal(storageEvents.size, 0);
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return {
    html: () => renderToStaticMarkup(render()),
    theme: () => document.documentElement.dataset.theme,
    saved: () => saved,
    click: () => render().props.onClick(),
    device(value) {
      preference.matches = value;
      mediaEvents.forEach((handler) => handler());
    },
    stored(value) {
      saved = value;
      storageEvents.forEach((handler) => handler({ key: "acb-theme" }));
    },
  };
}

test("shared theme toggle uses the site's saved preference and accessible sun/moon action", (t) => {
  const theme = setup(t, { saved: "light", dark: true });
  theme.html();
  assert.equal(theme.theme(), "light");
  assert.match(theme.html(), /Switch to dark mode/);
  assert.match(theme.html(), /theme-icon-moon/);
  theme.click();
  assert.equal(theme.theme(), "dark");
  assert.equal(theme.saved(), "dark");
  assert.match(theme.html(), /Switch to light mode/);
  assert.match(theme.html(), /theme-icon-sun/);
  theme.device(false);
  assert.equal(theme.theme(), "dark");
});

test("shared theme toggle follows device changes until a preference is set and syncs public-site storage changes", (t) => {
  const theme = setup(t);
  theme.html();
  theme.device(true);
  assert.equal(theme.theme(), "dark");
  theme.stored("light");
  assert.equal(theme.theme(), "light");
  theme.device(true);
  assert.equal(theme.theme(), "light");
  theme.stored(null);
  assert.equal(theme.theme(), "dark");
});

test("blocked storage does not prevent dashboard theme selection", (t) => {
  const theme = setup(t, { blocked: true, dark: true });
  theme.html();
  theme.click();
  assert.equal(theme.theme(), "light");
  theme.device(true);
  assert.equal(theme.theme(), "light");
});

test("public and dashboard presentations share behavior while retaining their own labels and classes", (t) => {
  const publicTheme = setup(t, { props: { showLabel: true } });
  assert.match(publicTheme.html(), /class="theme-toggle"/);
  assert.match(publicTheme.html(), />Dark Mode<\/span>/);
  publicTheme.click();
  assert.match(publicTheme.html(), />Light Mode<\/span>/);
});
