import test from "node:test";
import assert from "node:assert/strict";
import GA from "react-ga4";
import analytics, {
  trackEvent,
  setAnalyticsUserId,
  trackDashboardAction,
  measureDashboardAction,
  measureDashboardAuth,
} from "../src/utils/analytics.ts";

test("analytics initializes once, tracks links and controls, and cleans up", async () => {
  const calls = [];
  const handlers = new Map();
  const originalInitialize = GA.initialize;
  const originalEvent = GA.event;
  const originalGtag = GA.gtag;
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
      title: "Acton Citizens' Band",
      referrer: "https://example.com/from?token=secret#private",
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
    GA.gtag = (...args) => calls.push(args);
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
    for (const path of [
      "/__ /auth/action",
      "/__/auth/action?mode=resetPassword&oobCode=secret",
      "/dashboard/?mode=verifyEmail&oobCode=secret",
      "/unrelated",
    ]) {
      window.location = new URL("https://actoncitizensband.ca" + path);
      analytics.initGoogleAnalytics();
      assert.equal(calls.length, 0);
    }
    window.location = new URL(
      "https://actoncitizensband.ca/?secret=private&utm_source=facebook&utm_medium=social&utm_campaign=concert#token=private",
    );
    const cleanup = analytics.initGoogleAnalytics();
    const secondCleanup = analytics.initGoogleAnalytics();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][2].gtagOptions.page_referrer, "https://example.com/from");
    assert.equal(calls[0][2].gtagOptions.user_id, null);
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
    const id = "12345678-1234-4234-8234-123456789abc";
    setAnalyticsUserId(id);
    assert.deepEqual(calls.at(-1), ["config", "G-TEST", { user_id: id, send_page_view: false }]);
    const count = calls.length;
    setAnalyticsUserId(id);
    assert.equal(calls.length, count);
    setAnalyticsUserId("member@example.com");
    assert.equal(calls.at(-1)[2].user_id, null);
    window.location = new URL(
      "https://actoncitizensband.ca/dashboard/?private=secret#members/private-uid",
    );
    const beforePrivateClick = calls.length;
    link.textContent = "Private Member member@example.com";
    link.href = "https://example.com/private-user-id";
    handlers.get("click")({ type: "click", target: link });
    assert.equal(calls.length, beforePrivateClick);
    trackDashboardAction("event_save", "success");
    assert.deepEqual(calls.at(-1), [
      "dashboard_action",
      { action_name: "event_save", result: "success" },
    ]);
    assert.doesNotMatch(
      JSON.stringify(calls),
      /private-user-id|Private Member|member@example.com|token=secret/,
    );
    assert.equal(
      await measureDashboardAction("admin_profile_save", async () => "private profile"),
      "private profile",
    );
    assert.deepEqual(calls.at(-1), [
      "dashboard_action",
      { action_name: "admin_profile_save", result: "success" },
    ]);
    const failure = new Error("member@example.com private error details");
    await assert.rejects(
      measureDashboardAction("profile_save", async () => {
        throw failure;
      }),
      (error) => error === failure,
    );
    assert.deepEqual(calls.at(-1), [
      "dashboard_action",
      { action_name: "profile_save", result: "error" },
    ]);
    assert.equal(
      await measureDashboardAuth("sign_in", "email", async () => "private Auth result"),
      "private Auth result",
    );
    assert.deepEqual(calls.at(-1), [
      "dashboard_auth",
      { action_name: "sign_in", method: "email", result: "success" },
    ]);
    await assert.rejects(
      measureDashboardAuth("sign_in", "phone", async () => {
        throw failure;
      }),
      (error) => error === failure,
    );
    assert.deepEqual(calls.at(-1), [
      "dashboard_auth",
      { action_name: "sign_in", method: "phone", result: "error" },
    ]);
    assert.doesNotMatch(
      JSON.stringify(calls),
      /private profile|private Auth result|private error details|member@example.com/,
    );
    GA.event = () => {
      throw new Error("blocked");
    };
    assert.doesNotThrow(() => trackEvent("calendar_copy", { result: "success" }));
    cleanup();
    assert.equal(handlers.size, 2, "another mounted consumer still needs listeners");
    cleanup();
    secondCleanup();
    assert.equal(handlers.size, 0);
    const afterCleanup = calls.length;
    trackEvent("after_cleanup");
    assert.equal(calls.length, afterCleanup);
  } finally {
    if (originalMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalMode;
    GA.initialize = originalInitialize;
    GA.event = originalEvent;
    GA.gtag = originalGtag;
    if (originalId === undefined) delete process.env.REACT_APP_GOOGLE_ANALYTICS_TRACKING_ID;
    else process.env.REACT_APP_GOOGLE_ANALYTICS_TRACKING_ID = originalId;
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("dashboard initialization sanitizes email action URLs and can recover when initialization is blocked", async () => {
  const { default: dashboardAnalytics, trackEvent: emit } =
    await import("../src/utils/analytics.ts?dashboard");
  const originalInitialize = GA.initialize;
  const originalEvent = GA.event;
  const originalMode = process.env.NODE_ENV;
  const originalId = process.env.REACT_APP_GOOGLE_ANALYTICS_TRACKING_ID;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const calls = [];
  let listeners = 0;
  let cleanup = () => {};
  try {
    process.env.NODE_ENV = "production";
    process.env.REACT_APP_GOOGLE_ANALYTICS_TRACKING_ID = "G-TEST";
    globalThis.window = {
      location: new URL(
        "https://actoncitizensband.ca/dashboard/?mode=signIn&oobCode=secret&apiKey=private#private",
      ),
    };
    globalThis.document = {
      title: "Private member name",
      referrer: "https://actoncitizensband.ca/__/auth/action?oobCode=secret",
      addEventListener() {
        listeners++;
      },
      removeEventListener() {
        listeners--;
      },
    };
    GA.initialize = () => {
      throw Error("Blocked");
    };
    GA.event = (...args) => calls.push(args);
    assert.doesNotThrow(() => dashboardAnalytics.initGoogleAnalytics());
    emit("blocked_event");
    assert.equal(listeners, 0);
    assert.equal(calls.length, 0);
    GA.initialize = (...args) => calls.push(args);
    cleanup = dashboardAnalytics.initGoogleAnalytics();
    const options = calls[0][1].gtagOptions;
    assert.equal(options.page_location, "https://actoncitizensband.ca/dashboard/");
    assert.equal(options.page_title, "Dashboard | Acton Citizens' Band");
    assert.equal(options.allow_google_signals, false);
    assert.equal(options.allow_ad_personalization_signals, false);
    assert.doesNotMatch(JSON.stringify(calls), /oobCode|apiKey|secret|private|Private member name/);
    emit("dashboard_view", { screen_name: "profile" });
    assert.equal(calls.length, 2);
    window.location = new URL("https://acton-citizens-band--pr7-abc.web.app/dashboard/");
    emit("preview_event");
    assert.equal(calls.length, 2);
  } finally {
    cleanup();
    GA.initialize = originalInitialize;
    GA.event = originalEvent;
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    if (originalMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalMode;
    if (originalId === undefined) delete process.env.REACT_APP_GOOGLE_ANALYTICS_TRACKING_ID;
    else process.env.REACT_APP_GOOGLE_ANALYTICS_TRACKING_ID = originalId;
  }
});
