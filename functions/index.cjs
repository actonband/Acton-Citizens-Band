const functions = require("firebase-functions/v1");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { profileName } = require("./registration.cjs");

initializeApp();
const region = functions.region("northamerica-northeast1");

exports.dashboardRegistration = region.https.onCall((data, context) => {
  const { createRegistrationService } = require("./registration.cjs");
  return createRegistrationService({
    db: getFirestore(),
    auth: getAuth(),
    FieldValue,
    HttpsError: functions.https.HttpsError,
  }).handle(data, context);
});

async function removeProfile(uid) {
  const db = getFirestore();
  const profile = await db.doc(`users/${uid}`).get();
  // Keep a redirect after the redundant Auth identity is removed during linking.
  if (profile.data()?.merged_into) return;
  const [contacts, aliases] = await Promise.all([
    db.collection("profile_contacts").where("uid", "==", uid).get(),
    db.collection("users").where("merged_into", "==", uid).get(),
  ]);
  const batch = db.batch();
  for (const document of [...contacts.docs, ...aliases.docs]) batch.delete(document.ref);
  batch.delete(db.doc(`users/${uid}`));
  // Retain only a deletion marker so still-valid ID tokens cannot recreate the account.
  batch.set(db.doc(`access/${uid}`), { deleted: true });
  await batch.commit();
}

exports.deleteDashboardAccount = region.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  if (!uid)
    throw new functions.https.HttpsError("unauthenticated", "Sign in to delete your account.");
  if (data?.confirmation !== "DELETE")
    throw new functions.https.HttpsError("invalid-argument", "Confirm account deletion.");
  const authTime = context.auth.token.auth_time;
  const age = Date.now() / 1000 - authTime;
  if (typeof authTime !== "number" || !Number.isFinite(age) || age < 0 || age > 300) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Sign in again before deleting your account.",
    );
  }
  const access = (await getFirestore().doc(`access/${uid}`).get()).data();
  if (access?.linking || access?.deleted)
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Finish connecting your account before deleting it.",
    );

  // Delete identity first. An Auth deletion event independently retries Firestore cleanup.
  try {
    await getAuth().deleteUser(uid);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
  }
  try {
    await removeProfile(uid);
    return { deleted: true, cleanupPending: false };
  } catch {
    functions.logger.error("Account profile cleanup will be retried by the Auth deletion trigger.");
    return { deleted: true, cleanupPending: true };
  }
});

exports.cleanupDeletedDashboardAccount = functions
  .region("northamerica-northeast1")
  .runWith({ failurePolicy: true })
  .auth.user()
  .onDelete(async (user) => {
    await removeProfile(user.uid);
  });

function requireRecentSignIn(context) {
  const authTime = context.auth.token.auth_time;
  const age = Date.now() / 1000 - authTime;
  if (typeof authTime !== "number" || !Number.isFinite(age) || age < 0 || age > 300)
    throw new functions.https.HttpsError("failed-precondition", "Verify your identity and retry.");
}

function validateAccountType(userType, expected) {
  if (
    !["non-member", "past-member", "member", "admin"].includes(userType) ||
    typeof expected?.member !== "boolean" ||
    typeof expected?.admin !== "boolean" ||
    typeof expected?.requested !== "boolean" ||
    (expected.past_member !== undefined && typeof expected.past_member !== "boolean")
  )
    throw new functions.https.HttpsError("invalid-argument", "Choose a valid account type.");
}

function accountTypeFields(userType) {
  return {
    member: userType === "member" || userType === "admin",
    admin: userType === "admin",
    past_member: userType === "past-member",
  };
}

function checkAccountTypeRevision(access, profile, expected) {
  if (
    (access.member === true) !== expected.member ||
    (access.admin === true) !== expected.admin ||
    (access.past_member === true) !== (expected.past_member === true) ||
    (profile.membership_requested === true) !== expected.requested
  )
    throw new functions.https.HttpsError(
      "aborted",
      "The account type changed. Reload before saving.",
    );
}

async function identity(uid) {
  try {
    return await getAuth().getUser(uid);
  } catch (error) {
    if (error.code === "auth/user-not-found") return null;
    throw error;
  }
}

async function userDetails(uid) {
  const db = getFirestore();
  const [profile, access, auth] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`access/${uid}`).get(),
    identity(uid),
  ]);
  if ((!profile.exists && !auth) || access.data()?.deleted === true)
    throw new functions.https.HttpsError("not-found", "This user no longer exists.");
  const data = profile.data() || {};
  if (data.merged_into || access.data()?.linking)
    throw new functions.https.HttpsError(
      "failed-precondition",
      "This profile is being connected. Reload after setup finishes.",
    );
  return {
    uid,
    name: profileName(data).trim() || auth?.displayName?.trim() || "",
    instruments: typeof data.instruments === "string" ? data.instruments : "",
    requested: data.membership_requested === true,
    access: {
      member: access.data()?.member === true,
      admin: access.data()?.admin === true,
      past_member: access.data()?.past_member === true,
    },
    email: auth?.email || "",
    phone: auth?.phoneNumber || "",
    hasAuth: auth !== null,
    profileData: {
      instrument_details: data.instrument_details || [],
      notes: typeof data.notes === "string" ? data.notes : "",
    },
    revision: require("./registration.cjs").revision(data),
  };
}

// All cross-account changes are authorized here; client Firestore writes stay owner-only.
exports.manageDashboardUser = region.https.onCall(async (data, context) => {
  const actor = context.auth?.uid;
  if (!actor) throw new functions.https.HttpsError("unauthenticated", "Sign in to continue.");
  const db = getFirestore();
  const permission = (await db.doc(`access/${actor}`).get()).data();
  if (permission?.admin !== true || permission.deleted === true || permission.linking === true)
    throw new functions.https.HttpsError("permission-denied", "Administrator access is required.");
  const uid = data?.uid;
  if (typeof uid !== "string" || !uid.length || uid.length > 128 || /[\/\x00-\x1f]/.test(uid))
    throw new functions.https.HttpsError("invalid-argument", "Choose a valid user.");
  if (data.action === "get") return userDetails(uid);
  if (uid === actor)
    throw new functions.https.HttpsError(
      "permission-denied",
      "Use My Profile for your own account.",
    );
  const current = await userDetails(uid);

  if (data.action === "updateAccess") {
    requireRecentSignIn(context);
    validateAccountType(data.userType, data.expected);
    await db.runTransaction(async (transaction) => {
      const actorAccess = (await transaction.get(db.doc(`access/${actor}`))).data();
      if (actorAccess?.admin !== true || actorAccess.deleted || actorAccess.linking)
        throw new functions.https.HttpsError(
          "permission-denied",
          "Administrator access is required.",
        );
      const accessRef = db.doc(`access/${uid}`);
      const profileRef = db.doc(`users/${uid}`);
      const access = (await transaction.get(accessRef)).data() || {};
      const profile = await transaction.get(profileRef);
      if (access.deleted || !profile.exists)
        throw new functions.https.HttpsError("not-found", "This user no longer exists.");
      const latest = profile.data();
      if (access.linking || latest.merged_into)
        throw new functions.https.HttpsError(
          "aborted",
          "This account is being connected. Reload before editing.",
        );
      checkAccountTypeRevision(access, latest, data.expected);
      transaction.set(accessRef, accountTypeFields(data.userType), { merge: true });
      transaction.set(
        profileRef,
        {
          membership_requested: false,
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
    return userDetails(uid);
  }

  if (data.action === "updateProfile" || data.action === "updateProfileAndAccess") {
    const changingAccountType = data.action === "updateProfileAndAccess";
    if (changingAccountType) {
      requireRecentSignIn(context);
      validateAccountType(data.userType, data.expectedAccess);
    }
    const structured = data.profile
      ? require("./registration.cjs").normalizeProfile(data.profile, (code, message) => {
          throw new functions.https.HttpsError(code, message);
        })
      : null;
    if (
      typeof data.name !== "string" ||
      !data.name.trim() ||
      data.name.length > 100 ||
      typeof data.instruments !== "string" ||
      data.instruments.length > 500 ||
      typeof data.expected?.name !== "string" ||
      typeof data.expected?.instruments !== "string"
    )
      throw new functions.https.HttpsError("invalid-argument", "Check the name and instruments.");
    await db.runTransaction(async (transaction) => {
      if (changingAccountType) {
        const actorAccess = (await transaction.get(db.doc(`access/${actor}`))).data();
        if (actorAccess?.admin !== true || actorAccess.deleted || actorAccess.linking)
          throw new functions.https.HttpsError(
            "permission-denied",
            "Administrator access is required.",
          );
      }
      const ref = db.doc(`users/${uid}`);
      const snapshot = await transaction.get(ref);
      const latest = snapshot.data() || {};
      const access = await transaction.get(db.doc(`access/${uid}`));
      if (access.data()?.deleted === true)
        throw new functions.https.HttpsError("not-found", "This user was deleted.");
      if (access.data()?.linking || latest.merged_into)
        throw new functions.https.HttpsError(
          "aborted",
          "This account is being connected. Reload before editing.",
        );
      if (changingAccountType) {
        if (!snapshot.exists)
          throw new functions.https.HttpsError("not-found", "This user no longer exists.");
        checkAccountTypeRevision(access.data() || {}, latest, data.expectedAccess);
      }
      if (!structured && Array.isArray(latest.instrument_details))
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Reload the dashboard before editing this profile.",
        );
      if (structured && require("./registration.cjs").revision(latest) !== data.revision)
        throw new functions.https.HttpsError(
          "aborted",
          "The profile changed. Reload before saving.",
        );
      if (
        (profileName(latest) || (snapshot.exists ? "" : current.name)) !== data.expected.name ||
        (typeof latest.instruments === "string" ? latest.instruments : "") !==
          data.expected.instruments
      )
        throw new functions.https.HttpsError(
          "aborted",
          "The profile changed. Reload before saving.",
        );
      transaction.set(
        ref,
        {
          display_name: data.name.trim(),
          instruments: data.instruments.trim(),
          membership_requested: latest.membership_requested === true,
          updated_at: FieldValue.serverTimestamp(),
          ...(structured || {}),
          ...(changingAccountType ? { membership_requested: false } : {}),
        },
        { merge: true },
      );
      if (changingAccountType)
        transaction.set(db.doc(`access/${uid}`), accountTypeFields(data.userType), { merge: true });
    });
    return userDetails(uid);
  }

  if (data.action === "updateContact") {
    requireRecentSignIn(context);
    if (!current.hasAuth)
      throw new functions.https.HttpsError(
        "not-found",
        "This profile has no linked sign-in account.",
      );
    if (
      !["email", "phone"].includes(data.type) ||
      typeof data.value !== "string" ||
      typeof data.expected !== "string"
    )
      throw new functions.https.HttpsError("invalid-argument", "Choose a valid contact field.");
    if (current[data.type] !== data.expected)
      throw new functions.https.HttpsError("aborted", "The contact changed. Reload before saving.");
    let value = data.value.trim();
    let changes;
    if (data.type === "email") {
      if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        throw new functions.https.HttpsError("invalid-argument", "Enter a valid email address.");
      changes = { email: value, emailVerified: false };
    } else {
      const hasCountryCode = value.startsWith("+");
      const digits = value.replace(/\D/g, "");
      if (hasCountryCode) value = `+${digits}`;
      else if (digits.length === 10) value = `+1${digits}`;
      else if (/^1\d{10}$/.test(digits)) value = `+${digits}`;
      else value = digits;
      if (
        (value.startsWith("+1") && !/^\+1\d{10}$/.test(value)) ||
        !/^\+[1-9]\d{7,14}$/.test(value)
      )
        throw new functions.https.HttpsError("invalid-argument", "Include a valid country code.");
      changes = { phoneNumber: value };
    }
    try {
      await getAuth().updateUser(uid, changes);
    } catch (error) {
      if (["auth/email-already-exists", "auth/phone-number-already-exists"].includes(error.code))
        throw new functions.https.HttpsError(
          "already-exists",
          "That contact belongs to another account.",
        );
      if (["auth/invalid-email", "auth/invalid-phone-number"].includes(error.code))
        throw new functions.https.HttpsError("invalid-argument", "Check the contact details.");
      throw error;
    }
    const { createRegistrationService } = require("./registration.cjs");
    await createRegistrationService({
      db,
      auth: getAuth(),
      FieldValue,
      HttpsError: functions.https.HttpsError,
    }).syncUserContacts(await getAuth().getUser(uid));
    return userDetails(uid);
  }

  if (data.action === "delete") {
    requireRecentSignIn(context);
    if (data.confirmation !== "DELETE")
      throw new functions.https.HttpsError("invalid-argument", "Confirm account deletion.");
    if (current.hasAuth) {
      try {
        await getAuth().deleteUser(uid);
      } catch (error) {
        if (error.code !== "auth/user-not-found") throw error;
      }
    }
    try {
      await removeProfile(uid);
    } catch (error) {
      // A real Auth deletion has the independent retry trigger. Legacy profile-only records do not.
      if (!current.hasAuth) throw error;
      functions.logger.error(
        "Account profile cleanup will be retried by the Auth deletion trigger.",
      );
      return { deleted: true, cleanupPending: true };
    }
    return { deleted: true, cleanupPending: false };
  }
  throw new functions.https.HttpsError("invalid-argument", "Choose a valid account action.");
});
