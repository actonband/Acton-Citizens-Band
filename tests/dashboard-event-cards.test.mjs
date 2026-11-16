import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./helpers/components.mjs";
import * as events from "../src/utils/events.ts";
import * as firestoreValues from "../src/utils/firestoreValues.ts";

const require = createRequire(import.meta.url);
function component(filename, dependencies = {}) {
  return loadComponent(filename, {
    ...dependencies,
    "../../../utils/analytics": { trackEvent() {}, trackDashboardAction() {} },
    "../../utils/analytics": { trackEvent() {}, trackDashboardAction() {} },
    "../../../utils/events": events,
    "../utils/events": events,
    "../../../utils/firestoreValues": firestoreValues,
  }).default;
}
const AnalyticsLink = component("AnalyticsLink");
const EventDetails = component("EventDetails", {
  "./AnalyticsLink": { default: AnalyticsLink },
});
const EventCard = component("dashboard/events/EventCard", {
  "../../EventDetails": { default: EventDetails },
});
const EventEditor = component("dashboard/events/EventManager", {
  "../../../utils/firebase": { firestore: {} },
  "./EventCard": { default: EventCard },
  "../users/adminUsers": { manageUser: async () => ({ name: "" }) },
});
const data = {
  title: "Winter Concert",
  venue: "Town Hall",
  address: "12 Main Street",
  description: "Concert description",
  members_note: "Bring your music",
  cancelled: true,
  updated: { toDate: () => new Date("2026-11-14T21:00:00Z") },
  user_id: "/users/editor-uid",
  start: { toDate: () => new Date("2026-12-01T20:00:00Z") },
  end: { toDate: () => new Date("2026-12-01T22:00:00Z") },
  links: [
    { text: "Venue website", url: "https://example.com" },
    { text: "Unsafe link", url: "javascript:alert(1)" },
  ],
};
const event = { id: "winter", data, details: events.parseEvent("winter", data) };
const render = (compact) =>
  renderToStaticMarkup(createElement(EventCard, { event, compact, disabled: false, onEdit() {} }));

test("upcoming event cards render full details and keep external links outside the edit button", () => {
  const html = render(false);
  for (const value of [
    "Winter Concert",
    "Dec 1, 2026",
    "3:00 p.m.",
    "5:00 p.m.",
    "Town Hall",
    "12 Main Street",
    "Concert description",
    "Bring your music",
    "CANCELLED",
    "Venue website",
  ])
    assert.ok(html.includes(value), value);
  assert.ok(html.lastIndexOf("</a>") < html.indexOf("<button"));
  assert.doesNotMatch(html.slice(html.indexOf("<button"), html.indexOf("</button>")), /<a /);
  assert.doesNotMatch(html, /javascript:|Unsafe link/);
});

test("past event cards show only the title and date", () => {
  const html = render(true);
  assert.match(html, /Winter Concert/);
  assert.match(html, /<time[^>]*>Dec 1, 2026<\/time>/);
  for (const value of [
    "Town Hall",
    "12 Main Street",
    "Concert description",
    "Bring your music",
    "CANCELLED",
    "Venue website",
    "event-details",
    "<a ",
  ])
    assert.equal(html.includes(value), false, value);
});

test("read-only upcoming cards retain full details and working links without an edit button", () => {
  const html = renderToStaticMarkup(createElement(EventCard, { event }));
  for (const value of [
    "Winter Concert",
    "Town Hall",
    "Concert description",
    "Bring your music",
    'href="https://example.com/"',
  ])
    assert.ok(html.includes(value), value);
  assert.doesNotMatch(html, /<button|role="button"|tabindex=|member-card-profile/);
});

test("read-only past cards remain compact and have no interactive edit affordance", () => {
  const html = renderToStaticMarkup(createElement(EventCard, { event, compact: true }));
  assert.match(html, /Winter Concert/);
  assert.match(html, /Dec 1, 2026/);
  assert.doesNotMatch(html, /<button|event-details|Concert description|<a /);
});

test("public and dashboard event content share markup while only public links include Analytics metadata", () => {
  const publicHtml = renderToStaticMarkup(
    createElement(EventDetails, { event: event.details, analytics: true }),
  );
  const dashboardHtml = renderToStaticMarkup(createElement(EventCard, { event }));
  const withoutAnalytics = publicHtml.replace(/ data-analytics-[a-z-]+="[^"]*"/g, "");
  assert.ok(dashboardHtml.includes(withoutAnalytics));
  assert.match(publicHtml, /data-analytics-event="Event_Address_Maps_Link_Click"/);
  assert.match(publicHtml, /data-analytics-event="Event_Link_Click"/);
  assert.doesNotMatch(dashboardHtml, /data-analytics-/);
  assert.match(dashboardHtml, /https:\/\/maps.google.com\/\?q=12%20Main%20Street/);
});

test("shared event details include the end date for events spanning multiple days", () => {
  const html = renderToStaticMarkup(
    createElement(EventDetails, {
      event: {
        ...event.details,
        end: new Date("2026-12-02T22:00:00Z"),
      },
    }),
  );
  assert.match(html, /Dec 2, 2026 at/);
});

test("shared events view defaults to read-only and exposes creation only for admins", () => {
  const readOnly = renderToStaticMarkup(createElement(EventEditor));
  assert.match(readOnly, />Events<\/h2>/);
  assert.match(readOnly, /Refresh/);
  assert.doesNotMatch(readOnly, /New Event|Create Event|Edit Event|<form/);
  const admin = renderToStaticMarkup(createElement(EventEditor, { canEdit: true }));
  assert.match(admin, /Manage Events/);
  assert.match(admin, /New Event/);
});

function eventView(
  t,
  canEdit = false,
  profile = { display_name: "Event Organizer" },
  accountName = "",
) {
  const state = [];
  let cursor = 0;
  const effects = [];
  const cleanups = [];
  const profileReads = [];
  const accountReads = [];
  const writes = [];
  const priorWindow = globalThis.window;
  const priorAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.window = {
    setInterval: () => 1,
    clearInterval() {},
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.requestAnimationFrame = (callback) => callback();
  t.after(() => {
    cleanups.forEach((cleanup) => cleanup?.());
    globalThis.window = priorWindow;
    globalThis.requestAnimationFrame = priorAnimationFrame;
  });
  const records = [
    {
      id: "future",
      data: { ...data, start: { toDate: () => new Date("2099-12-01T20:00:00Z") }, end: null },
    },
    {
      id: "past",
      data: {
        ...data,
        title: "Past Concert",
        start: { toDate: () => new Date("2000-12-01T20:00:00Z") },
        end: null,
      },
    },
  ];
  const react = require("react");
  const View = component("dashboard/events/EventManager", {
    react: {
      ...react,
      useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
        return [
          state[index],
          (next) => {
            state[index] = typeof next === "function" ? next(state[index]) : next;
          },
        ];
      },
      useRef: () => ({ current: null }),
      useEffect(callback, deps) {
        const index = cursor++;
        const prior = state[index];
        if (!prior || deps.some((item, i) => item !== prior[i])) {
          state[index] = deps;
          effects.push(callback);
        }
      },
    },
    "firebase/firestore": {
      ...require("firebase/firestore"),
      collection: () => ({}),
      doc: (_db, _collection, id) => ({ id }),
      getDocs: async () => ({
        docs: records.map((record) => ({ id: record.id, data: () => record.data })),
      }),
      getDoc: async (ref) => {
        profileReads.push(ref.id);
        return { data: () => profile };
      },
      runTransaction: async (_db, callback) =>
        callback({
          get: async (ref) => ({
            exists: () => records.some((record) => record.id === ref.id),
            data: () => records.find((record) => record.id === ref.id)?.data,
          }),
          set: (ref, value) => {
            writes.push(value);
            const record = records.find((record) => record.id === ref.id);
            if (record) record.data = { ...record.data, ...value };
          },
        }),
    },
    "../../../utils/firebase": { firestore: {}, firebaseAuth: { currentUser: { uid: "admin" } } },
    "./EventCard": { default: EventCard },
    "../users/adminUsers": {
      manageUser: async (request) => {
        accountReads.push(request);
        if (accountName instanceof Error) throw accountName;
        return { name: accountName };
      },
    },
  });
  function render() {
    cursor = 0;
    const tree = View({ canEdit });
    while (effects.length) cleanups.push(effects.shift()());
    return tree;
  }
  function find(tree, predicate) {
    if (!tree || typeof tree !== "object") return;
    if (Array.isArray(tree)) return tree.map((child) => find(child, predicate)).find(Boolean);
    if (predicate(tree)) return tree;
    if (typeof tree.type === "function") return find(tree.type(tree.props), predicate);
    return find(tree.props?.children, predicate);
  }
  return {
    profileReads,
    accountReads,
    writes,
    html: () => renderToStaticMarkup(render()),
    settle: () => new Promise((resolve) => setImmediate(resolve)),
    open(id) {
      const card = find(render(), (node) => node.type === EventCard && node.props.event.id === id);
      find(card.type(card.props), (node) => node.type === "button").props.onClick();
      render();
    },
    click(label) {
      const button = find(
        render(),
        (node) => node.type === "button" && node.props.children === label,
      );
      assert.ok(button, `Expected ${label} button`);
      button.props.onClick();
      render();
    },
    changeTitle(value) {
      find(
        render(),
        (node) => node.type === "input" && node.props.maxLength === 500,
      ).props.onChange({ target: { value } });
      render();
    },
    changeStart(value) {
      find(
        render(),
        (node) => node.type === "input" && node.props.type === "datetime-local",
      ).props.onChange({ target: { value } });
      render();
    },
    link(index, field, value) {
      find(
        render(),
        (node) => node.type === "input" && node.props["aria-label"] === `Link ${index} ${field}`,
      ).props.onChange({ target: { value } });
      render();
    },
    removeLink(index) {
      find(
        render(),
        (node) => node.type === "button" && node.props["aria-label"] === `Remove link ${index}`,
      ).props.onClick();
      render();
    },
    async save() {
      await find(render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
      render();
    },
    back() {
      find(
        render(),
        (node) => node.type === "button" && node.props.children === "Back To Events",
      ).props.onClick();
    },
  };
}

test("non-admins open upcoming and past events with all details and no update metadata", async (t) => {
  const view = eventView(t);
  view.html();
  await view.settle();
  assert.match(view.html(), /View Event/);
  assert.match(view.html(), /<button[^>]*class="event-card-compact"/);
  for (const id of ["future", "past"]) {
    view.open(id);
    const html = view.html();
    for (const text of [
      "Event Details",
      "Back To Events",
      "Town Hall",
      "12 Main Street",
      "Concert description",
      "Bring your music",
      "Venue website",
      "CANCELLED",
    ])
      assert.ok(html.includes(text), text);
    assert.doesNotMatch(html, /Updated|editor-uid|<form|Edit Event|Save Event/);
    assert.deepEqual(view.profileReads, []);
    view.back();
    assert.match(view.html(), /Upcoming Events/);
    assert.match(view.html(), /Past Events/);
  }
});

test("admin editor shows update metadata above the form with the updater's profile name", async (t) => {
  const view = eventView(t, true);
  view.html();
  await view.settle();
  view.open("past");
  view.click("Edit Event");
  await view.settle();
  const html = view.html();
  assert.match(html, /<dt>Updated<\/dt>/);
  assert.match(html, /<dt>Updated By<\/dt>/);
  assert.match(html, /Event Organizer/);
  assert.ok(html.indexOf("Updated By") < html.indexOf("<form"));
  assert.doesNotMatch(html, /readonly|<input[^>]*value="Event Organizer"/i);
  assert.match(html, /Save Event/);
  assert.deepEqual(view.profileReads, ["editor-uid"]);
});

test("admins open upcoming and past events read-only until Edit event is clicked", async (t) => {
  const view = eventView(t, true);
  view.html();
  await view.settle();
  for (const id of ["future", "past"]) {
    view.open(id);
    let html = view.html();
    assert.match(html, /Event Details/);
    assert.match(html, /Edit Event/);
    assert.match(html, /Concert description/);
    assert.doesNotMatch(html, /<form|<input|Save Event/);
    view.click("Edit Event");
    html = view.html();
    assert.match(html, /<form/);
    assert.match(html, /Save Event/);
    view.click("Cancel");
    html = view.html();
    assert.match(html, /Event Details/);
    assert.match(html, /Edit Event/);
    assert.doesNotMatch(html, /<form|Save Event/);
    view.back();
    assert.match(view.html(), /Manage Events/);
  }
});

test("cancelling event edits respects unsaved changes and restores the original read-only details", async (t) => {
  const previousConfirm = globalThis.confirm;
  t.after(() => {
    globalThis.confirm = previousConfirm;
  });
  const view = eventView(t, true);
  view.html();
  await view.settle();
  view.open("past");
  view.click("Edit Event");
  view.changeTitle("Unsaved title");
  globalThis.confirm = () => false;
  view.click("Cancel");
  assert.match(view.html(), /value="Unsaved title"/);
  globalThis.confirm = () => true;
  view.click("Cancel");
  assert.match(view.html(), /Past Concert/);
  assert.doesNotMatch(view.html(), /Unsaved title|<form/);
});

test("New event still opens a blank editor directly for admins", async (t) => {
  const view = eventView(t, true);
  view.html();
  await view.settle();
  view.click("New Event");
  assert.match(view.html(), /<form/);
  assert.match(view.html(), /Create Event/);
  view.click("Cancel");
  assert.match(view.html(), /Manage Events/);
  assert.doesNotMatch(view.html(), /<form/);
});

test("event links can be added, edited and removed without delimiter parsing or saving draft IDs", async (t) => {
  const view = eventView(t, true);
  view.html();
  await view.settle();
  view.open("past");
  view.click("Edit Event");
  assert.match(view.html(), /value="Venue website"/);
  assert.match(view.html(), /value="javascript:alert\(1\)"/);
  view.removeLink(2);
  view.link(1, "label", " Tickets | Info ");
  view.link(1, "URL", "https://example.com/tickets?event=band");
  view.click("Add Link");
  view.link(2, "label", " Venue ");
  view.link(2, "URL", "https://venue.example.com");
  view.removeLink(1);
  assert.match(view.html(), /aria-label="Link 1 label"[^>]*value=" Venue "/);
  assert.doesNotMatch(view.html(), /Tickets \| Info/);
  view.click("Add Link");
  view.link(2, "label", "Tickets | Info");
  view.link(2, "URL", "https://example.com/tickets?event=band");
  view.changeStart("2026-12-05T14:00");
  await view.save();
  assert.deepEqual(view.writes[0].links, [
    { text: "Venue", url: "https://venue.example.com" },
    { text: "Tickets | Info", url: "https://example.com/tickets?event=band" },
  ]);
  assert.match(view.html(), /Event saved/);
});

test("incomplete link rows prevent saving and remain editable", async (t) => {
  const view = eventView(t, true);
  view.html();
  await view.settle();
  view.open("past");
  view.click("Edit Event");
  view.removeLink(2);
  view.link(1, "URL", "");
  view.changeStart("2026-12-05T14:00");
  await view.save();
  assert.equal(view.writes.length, 0);
  assert.match(view.html(), /enter both a label and a URL/);
  assert.match(view.html(), /value="Venue website"/);
});

test("missing updater names show an honest fallback without exposing the identifier", async (t) => {
  const view = eventView(t, true, null);
  view.html();
  await view.settle();
  view.open("past");
  await view.settle();
  assert.match(view.html(), /Name unavailable/);
  assert.doesNotMatch(view.html(), /editor-uid/);
});

test("missing updater profiles fall back to the sign-in account name", async (t) => {
  const view = eventView(t, true, null, "Original Organizer");
  view.html();
  await view.settle();
  view.open("past");
  assert.match(view.html(), /Loading name/);
  assert.doesNotMatch(view.html(), /editor-uid/);
  await view.settle();
  assert.match(view.html(), /Original Organizer/);
  assert.deepEqual(view.accountReads, [{ action: "get", uid: "editor-uid" }]);
});

test("updater lookup errors show a retry instead of claiming the name is missing", async (t) => {
  const view = eventView(
    t,
    true,
    null,
    Object.assign(new Error("Offline"), { code: "functions/unavailable" }),
  );
  view.html();
  await view.settle();
  view.open("past");
  await view.settle();
  assert.match(view.html(), /Unable to load name/);
  assert.match(view.html(), /Retry Name/);
  assert.doesNotMatch(view.html(), /Name unavailable|editor-uid/);
});

test("a deleted updater account shows Name unavailable without a misleading retry", async (t) => {
  const view = eventView(
    t,
    true,
    null,
    Object.assign(new Error("Missing"), { code: "functions/not-found" }),
  );
  view.html();
  await view.settle();
  view.open("past");
  await view.settle();
  assert.match(view.html(), /Name unavailable/);
  assert.doesNotMatch(view.html(), /Retry Name|editor-uid/);
});

test("non-admin dashboard navigation exposes Events and keeps member management hidden", () => {
  const empty = { default: () => null };
  const react = require("react");
  let nullState = 0;
  const Dashboard = component("dashboard/Dashboard", {
    react: {
      ...react,
      useState(initial) {
        if (initial === null) {
          nullState++;
          if (nullState === 1)
            initial = { uid: "registered-user", data: { member: false, admin: false } };
          if (nullState === 2)
            initial = { uid: "registered-user", data: { display_name: "Member" } };
          if (nullState === 3) initial = { state: "complete" };
        }
        return react.useState(initial);
      },
    },
    "../auth/AuthContext": {
      useAuth: () => ({
        user: { uid: "registered-user", email: "member@example.com", phoneNumber: null },
        loading: false,
        authSignOut: async () => {},
      }),
    },
    "../../utils/firebase": { firestore: {} },
    "../auth/Login": empty,
    "./events/EventManager": { default: EventEditor },
    "../profile/DeleteAccount": empty,
    "./users/UserManagement": empty,
    "../profile/ProfileFields": { ProfileSummary: () => null, ProfileContactRow: () => null },
    "../profile/AccountSetup": empty,
    "../profile/ProfileEditor": empty,
    "../profile/registration": {},
    "../ThemeToggle": { default: () => null },
  });
  const html = renderToStaticMarkup(createElement(Dashboard));
  assert.match(html, />Events<\/button>/);
  assert.doesNotMatch(html, /Manage Users|Manage Events|New Event/);
});
