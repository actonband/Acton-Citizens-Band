import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent, loadSource } from "./helpers/components.mjs";

const require = createRequire(import.meta.url);
const profileFields = loadComponent("profile/ProfileFields");
const { adminUserError } = loadSource(
  new URL("../src/components/dashboard/users/adminUsers.ts", import.meta.url),
  { "firebase/functions": {}, "../../../utils/firebase": {}, "../../../utils/analytics": {} },
);
function setup(t, failure, preview, requested = false, verification = true) {
  const state = [];
  let cursor = 0;
  const effects = [];
  const calls = [];
  const verificationCalls = [];
  const failures = Array.isArray(failure) ? [...failure] : null;
  let changed = 0;
  const user = {
    uid: "target",
    name: "Member",
    instruments: "Flute",
    access: { member: true, admin: false },
    requested,
    profileData: {},
    email: "member@example.com",
    phone: "",
    hasAuth: true,
    revision: "1:0",
  };
  const priorWindow = globalThis.window;
  const priorFrame = globalThis.requestAnimationFrame;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.requestAnimationFrame = (callback) => callback();
  t.after(() => {
    globalThis.window = priorWindow;
    globalThis.requestAnimationFrame = priorFrame;
  });
  const empty = { default: () => null };
  const View = loadComponent("dashboard/users/AdminUserProfile", {
    react: {
      ...require("react"),
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
      useRef(initial) {
        const index = cursor++;
        return (state[index] ||= { current: initial });
      },
      useEffect(callback, deps) {
        const index = cursor++;
        const prior = state[index];
        if (!prior || deps.some((item, i) => item !== prior[i])) {
          state[index] = deps;
          effects.push(callback);
        }
      },
    },
    "../../profile/ProfileFields": profileFields,
    "./adminUsers": {
      manageUser: async (request) => {
        calls.push(request);
        if (request.action === "get") return user;
        const failed = failures ? failures.shift() : failure;
        if (failed) throw typeof failed === "string" ? { code: failed } : failed;
        return {
          ...user,
          name: request.name,
          instruments: request.instruments,
          access: request.userType
            ? {
                member: request.userType === "member" || request.userType === "admin",
                admin: request.userType === "admin",
                past_member: request.userType === "past-member",
              }
            : user.access,
          requested: request.userType ? false : user.requested,
        };
      },
      adminUserError,
    },
    "../../../utils/phone": {
      normalizePhoneNumber: (value) => value,
      formatPhoneNumber: (value) => value,
    },
    "../../profile/DeleteAccount": empty,
    "../../auth/IdentityVerification": {
      default: require("react").forwardRef(({ onError }, ref) => {
        ref.current = {
          verify: async () => {
            verificationCalls.push("verify");
            if (!verification) onError("Incorrect verification details.");
            return verification;
          },
        };
        return require("react").createElement("p", null, "Verify identity fields");
      }),
    },
    "../../profile/ProfileFormFields": {
      default: ({ value, onChange }) =>
        require("react").createElement(
          "label",
          null,
          "Name",
          require("react").createElement("input", {
            value: value.name,
            onChange: (event) => onChange({ ...value, name: event.target.value }),
          }),
        ),
    },
    "../../profile/registration": {
      profileDraft: (data) => ({
        name: data.display_name || "",
        instrumentDetails: data.instruments
          ? [{ name: data.instruments, ownership: "personal", loanForm: "unsure", details: "" }]
          : [],
        notes: "",
        membershipRequested: data.membership_requested === true,
      }),
    },
  }).default;
  function render() {
    cursor = 0;
    const tree = View({
      preview,
      uid: "target",
      onBack() {},
      onDeleted() {},
      onChanged() {
        changed++;
      },
    });
    while (effects.length) effects.shift()();
    return tree;
  }
  function find(node, predicate) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
    if (predicate(node)) return node;
    if (typeof node.type === "function") return find(node.type(node.props), predicate);
    return find(node.props?.children, predicate);
  }
  return {
    calls,
    verificationCalls,
    changed: () => changed,
    html: () => renderToStaticMarkup(render()),
    settle: () => new Promise((resolve) => setImmediate(resolve)),
    click(text) {
      find(
        render(),
        (node) =>
          node.type === "button" &&
          require("react").Children.toArray(node.props.children).join("") === text,
      ).props.onClick();
    },
    select(value) {
      find(render(), (node) => node.type === "select").props.onChange({ target: { value } });
    },
    name(value) {
      find(render(), (node) => node.type === "input").props.onChange({ target: { value } });
    },
    save() {
      find(render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
    },
  };
}

test("known profile details appear immediately while fresh account details are loading", async (t) => {
  const view = setup(t, undefined, {
    name: "Preview Member",
    instruments: "Clarinet",
    requested: false,
    access: { member: true },
    details: {},
  });
  const html = view.html();
  assert.match(html, /Preview Member/);
  assert.match(html, /Clarinet/);
  assert.match(html, /Loading profile details/);
  assert.doesNotMatch(html, /Edit Profile|Change account type|Delete/);
  await view.settle();
  assert.doesNotMatch(view.html(), /Preview Member|Loading profile details/);
  assert.match(view.html(), /Edit Profile/);
});

test("admin account type and profile fields share one explicit save and refresh the summary", async (t) => {
  const view = setup(t);
  view.html();
  await view.settle();
  assert.doesNotMatch(view.html(), /Change account type|<select/);
  view.click("Edit Profile");
  assert.match(view.html(), /Non-Member/);
  view.select("admin");
  view.name("Updated Member");
  assert.equal(view.calls.length, 1);
  view.save();
  await view.settle();
  assert.deepEqual(view.calls[1], {
    action: "updateProfileAndAccess",
    uid: "target",
    name: "Updated Member",
    instruments: "Flute",
    profile: {
      name: "Updated Member",
      instrumentDetails: [
        { name: "Flute", ownership: "personal", loanForm: "unsure", details: "" },
      ],
      notes: "",
      membershipRequested: false,
    },
    revision: "1:0",
    expected: { name: "Member", instruments: "Flute" },
    userType: "admin",
    expectedAccess: { member: true, admin: false, requested: false },
  });
  assert.equal(view.calls.length, 2, "one mutation submits both changes");
  assert.match(view.html(), /Updated Member/);
  assert.match(view.html(), /Administrator/);
  assert.match(view.html(), /Profile saved/);
  assert.doesNotMatch(view.html(), /<select/);
  assert.equal(view.changed(), 1);
});

test("Past Member can be saved and reopened without member or administrator access", async (t) => {
  const view = setup(t);
  view.html();
  await view.settle();
  view.click("Edit Profile");
  assert.match(view.html(), /<option value="past-member">Past Member/);
  view.select("past-member");
  view.save();
  await view.settle();
  assert.match(view.html(), /<span>Past Member<\/span>/);
  assert.equal(view.calls[1].userType, "past-member");
  view.click("Edit Profile");
  assert.match(view.html(), /<option value="past-member" selected="">Past Member/);
});

test("cancelling a role change performs no mutation", async (t) => {
  const view = setup(t);
  view.html();
  await view.settle();
  view.click("Edit Profile");
  view.name("Discarded name");
  view.select("non-member");
  view.click("Cancel");
  assert.equal(view.calls.length, 1);
  assert.doesNotMatch(view.html(), /<select/);
  assert.doesNotMatch(view.html(), /Discarded name/);
});

test("editing profile details alone does not submit a role change or clear a membership request", async (t) => {
  const view = setup(t, undefined, undefined, true);
  view.html();
  await view.settle();
  view.click("Edit Profile");
  view.name("New name");
  view.save();
  await view.settle();
  assert.equal(view.calls[1].action, "updateProfile");
  assert.equal(view.calls[1].profile.membershipRequested, true);
  assert.ok(!("userType" in view.calls[1]));
  assert.ok(!("expectedAccess" in view.calls[1]));
  assert.match(view.html(), /New name/);
});

for (const code of ["functions/aborted", "functions/failed-precondition"])
  test(`failed role change retains the form for recovery: ${code}`, async (t) => {
    const view = setup(t, code);
    view.html();
    await view.settle();
    view.click("Edit Profile");
    view.select("non-member");
    view.save();
    await view.settle();
    const html = view.html();
    assert.match(html, /<select/);
    assert.match(html, /role="alert"/);
    assert.doesNotMatch(html, /Profile saved/);
    if (code === "functions/failed-precondition") assert.match(html, /Verify identity fields/);
    const formEnd = html.indexOf("</form>");
    assert.ok(html.indexOf('role="alert"') < formEnd, "error is inside the active save form");
    if (code === "functions/failed-precondition") {
      assert.ok(
        html.indexOf("Verify identity fields") < html.indexOf("Save Profile"),
        "verification fields appear before the same save button",
      );
      assert.ok(html.indexOf("Verify identity fields") < formEnd);
      assert.equal((html.match(/Verify identity fields/g) || []).length, 1);
      assert.equal((html.match(/<form\b/g) || []).length, 1);
    }
    assert.equal(view.changed(), 0);
  });

for (const type of ["email", "phone"])
  test(`contact verification appears once above Save ${type} and retries the same edit`, async (t) => {
    const view = setup(t, ["functions/failed-precondition", null]);
    view.html();
    await view.settle();
    const label = type === "email" ? "Email" : "Phone";
    view.click(type === "email" ? "Edit Email" : "Add Phone");
    const value = type === "email" ? "new@example.com" : "+15195551234";
    view.name(value);
    view.save();
    await view.settle();
    const html = view.html();
    assert.equal((html.match(/Verify identity fields/g) || []).length, 1);
    assert.equal((html.match(/<form\b/g) || []).length, 1);
    assert.ok(html.indexOf("<form") < html.indexOf("Verify identity fields"));
    assert.ok(html.indexOf("Verify identity fields") < html.indexOf(`Save ${label}`));
    assert.ok(html.indexOf(`Save ${label}`) < html.indexOf("</form>"));
    view.save();
    await view.settle();
    assert.equal(view.verificationCalls.length, 1);
    assert.deepEqual(view.calls[1], {
      action: "updateContact",
      uid: "target",
      type,
      value,
      expected: type === "email" ? "member@example.com" : "",
    });
    assert.deepEqual(view.calls[2], view.calls[1]);
    assert.equal(view.changed(), 1);
  });

test("an unsupported combined-save action explains the server update immediately below Save profile", async (t) => {
  const view = setup(t, {
    code: "functions/invalid-argument",
    message: "Choose a valid account action.",
  });
  view.html();
  await view.settle();
  view.click("Edit Profile");
  view.name("Unsaved edit");
  view.select("non-member");
  view.save();
  await view.settle();
  const html = view.html();
  assert.match(html, /server needs updating/);
  assert.match(html, /Your changes were not saved/);
  assert.doesNotMatch(
    html,
    /Check the details|Choose a valid account action|Verify identity fields/,
  );
  assert.match(html, /value="Unsaved edit"/);
  const save = html.indexOf("Save Profile");
  const alert = html.indexOf('id="admin-profile-save-error"');
  assert.ok(save < alert && alert < html.indexOf("</form>"));
  assert.ok(alert < html.indexOf('class="profile-contact-details"'));
  assert.equal((html.match(/role="alert"/g) || []).length, 1);
  assert.equal(view.changed(), 0);
});

test("the same Save profile button verifies identity and completes the pending change", async (t) => {
  const view = setup(t, ["functions/failed-precondition", null]);
  view.html();
  await view.settle();
  view.click("Edit Profile");
  view.name("Pending update");
  view.select("admin");
  view.save();
  await view.settle();
  assert.match(view.html(), /Verify identity fields/);
  assert.doesNotMatch(view.html(), />Continue<|Identity verified\. Save the change again/);
  view.save();
  await view.settle();
  assert.equal(view.verificationCalls.length, 1);
  assert.equal(view.calls.length, 3);
  assert.deepEqual(
    view.calls[2],
    view.calls[1],
    "the verified retry preserves the exact edited values",
  );
  assert.match(view.html(), /Pending update/);
  assert.match(view.html(), /Profile saved/);
  assert.equal(view.changed(), 1);
});

test("incomplete or failed verification never submits the pending profile mutation", async (t) => {
  const view = setup(t, ["functions/failed-precondition", null], undefined, false, false);
  view.html();
  await view.settle();
  view.click("Edit Profile");
  view.name("Retain this draft");
  view.select("admin");
  view.save();
  await view.settle();
  view.html();
  view.save();
  await view.settle();
  assert.equal(view.verificationCalls.length, 1);
  assert.equal(view.calls.length, 2);
  assert.match(view.html(), /Incorrect verification details/);
  assert.match(view.html(), /value="Retain this draft"/);
  assert.doesNotMatch(view.html(), /Profile saved/);
  assert.equal(view.changed(), 0);
});

test("admin validation messages are specific without displaying arbitrary error details", () => {
  for (const message of [
    "Check the name and instruments.",
    "Check each instrument and loan-form answer.",
    "Enter a valid email address.",
  ])
    assert.equal(adminUserError({ code: "functions/invalid-argument", message }), message);
  assert.equal(
    adminUserError({
      code: "functions/invalid-argument",
      message: "private@example.com confidential profile",
    }),
    "Check the details and try again.",
  );
  assert.equal(
    adminUserError({ code: "functions/internal", message: "private@example.com" }),
    "Unable to complete this action. Check your connection and retry.",
  );
});
