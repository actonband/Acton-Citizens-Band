import test from "node:test";
import assert from "node:assert/strict";
import GA from "react-ga4";
import analytics, { trackEvent } from "../src/utils/GoogleAnalytics.ts";

test("analytics initializes once, tracks links and controls, and cleans up", () => {
  const calls = [];
  const handlers = new Map();
  const originalInitialize = GA.initialize;
  const originalEvent = GA.event;
  const originalMode = process.env.NODE_ENV;
  const originalId = process.env.REACT_APP_GOOGLE_ANALYTICS_TRACKING_ID;
  const originals = Object.fromEntries(
    ["window", "document", "Element", "HTMLAnchorElement"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  class Element {
    dataset = {};
    textContent = "Example";
    closest(selector) {
      if (selector.startsWith("a[")) return this;
      if (selector === "section, nav, footer, header") return { id: "footer" };
      return null;
    }
    getAttribute() {
      return null;
    }
    querySelector() {
      return null;
    }
  }
  class Anchor extends Element {
    href = "https://example.com/event?token=private";
  }
  try {
    globalThis.window = {
      location: new URL(
        "https://actoncitizensband.ca/?secret=private&utm_source=facebook&utm_medium=social&utm_campaign=concert#token=private",
      ),
    };
    globalThis.document = {
      addEventListener(type, handler) {
        handlers.set(type, handler);
      },
      removeEventListener(type) {
        handlers.delete(type);
      },
    };
    globalThis.Element = Element;
    globalThis.HTMLAnchorElement = Anchor;
    GA.initialize = (...args) => calls.push(["initialize", ...args]);
    GA.event = (...args) => calls.push(args);
    delete process.env.REACT_APP_GOOGLE_ANALYTICS_TRACKING_ID;
    analytics.initGoogleAnalytics();
    trackEvent("disabled");
    assert.equal(calls.length, 0);
    process.env.REACT_APP_GOOGLE_ANALYTICS_TRACKING_ID = "G-TEST";
    for (const hostname of [
      "localhost",
      "127.0.0.1",
      "acton-citizens-band--pr5-abc.web.app",
      "example.com",
    ]) {
      window.location = new URL("https://" + hostname);
      analytics.initGoogleAnalytics();
      assert.equal(calls.length, 0);
      assert.equal(handlers.size, 0);
    }
    window.location = new URL(
      "https://actoncitizensband.ca/?secret=private&utm_source=facebook&utm_medium=social&utm_campaign=concert#token=private",
    );
    process.env.NODE_ENV = "development";
    analytics.initGoogleAnalytics();
    assert.equal(calls.length, 0);
    process.env.NODE_ENV = "production";
    const cleanup = analytics.initGoogleAnalytics();
    analytics.initGoogleAnalytics();
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0][2].gtagOptions.page_location,
      "https://actoncitizensband.ca/?utm_source=facebook&utm_medium=social&utm_campaign=concert",
    );
    const link = new Anchor();
    handlers.get("click")({ type: "click", target: link });
    assert.equal(calls[1][0], "link_click");
    assert.equal(calls[1][1].link_url, "https://example.com/event");
    assert.equal(calls[1][1].outbound, true);
    link.dataset = {
      analyticsEvent: "Join_Section_Email_Link_Click",
      analyticsLabel: "join",
      analyticsGroup: "email",
      analyticsButton: "Join Us",
    };
    link.href = "mailto:band@example.com?body=private";
    handlers.get("click")({ type: "click", target: link });
    assert.equal(calls[2][0], "Join_Section_Email_Link_Click");
    assert.equal(calls[2][1].link_url, "mailto:");
    assert.equal(calls[2][1].button_group, "email");
    assert.equal(calls[2][1].button_name, "Join Us");
    handlers.get("auxclick")({ type: "auxclick", button: 2, target: link });
    assert.equal(calls.length, 3);
    handlers.get("auxclick")({ type: "auxclick", button: 1, target: link });
    assert.equal(calls.length, 4);
    const button = new Element();
    button.dataset = { analyticsEvent: "events_retry" };
    handlers.get("click")({ type: "click", target: button });
    assert.equal(calls[4][0], "events_retry");
    GA.event = () => {
      throw new Error("blocked");
    };
    assert.doesNotThrow(() => trackEvent("calendar_copy", { result: "success" }));
    cleanup();
    assert.equal(handlers.size, 0);
  } finally {
    if (originalMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalMode;
    GA.initialize = originalInitialize;
    GA.event = originalEvent;
    if (originalId === undefined) delete process.env.REACT_APP_GOOGLE_ANALYTICS_TRACKING_ID;
    else process.env.REACT_APP_GOOGLE_ANALYTICS_TRACKING_ID = originalId;
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
