const { createHash, randomUUID } = require("node:crypto");

const emailKey = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");
function phoneKey(value) {
  if (typeof value !== "string") return "";
  const digits = value.replace(/\D/g, "");
  if (value.trim().startsWith("+")) return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : "";
  return digits.length === 10 ? `+1${digits}` : /^1\d{10}$/.test(digits) ? `+${digits}` : "";
}
function profileName(data = {}) {
  return typeof data.display_name === "string"
    ? data.display_name
    : [data.first_name, data.last_name].filter((value) => typeof value === "string").join(" ");
}
function established(data, access = {}) {
  return Boolean(
    (data && (data.setup_completed_at || profileName(data).trim() || data.instruments?.trim?.())) ||
    access?.member === true ||
    access?.admin === true,
  );
}
function revision(data = {}) {
  const time = data.updated_at;
  return time && typeof time.seconds === "number" && typeof time.nanoseconds === "number"
    ? `${time.seconds}:${time.nanoseconds}`
    : "";
}
function normalizeProfile(value, fail) {
  const name = typeof value?.name === "string" ? value.name.trim() : "";
  const notes = typeof value?.notes === "string" ? value.notes.trim() : "";
  if (
    !name ||
    name.length > 100 ||
    notes.length > 1000 ||
    !Array.isArray(value?.instrumentDetails) ||
    value.instrumentDetails.length > 12 ||
    typeof value.membershipRequested !== "boolean"
  )
    fail("invalid-argument", "Check your name, notes and instruments.");
  const instrument_details = value.instrumentDetails.map((item) => {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    const details = typeof item?.details === "string" ? item.details.trim() : "";
    if (
      !name ||
      name.length > 80 ||
      details.length > 200 ||
      !["personal", "band"].includes(item.ownership) ||
      (item.ownership === "band" && !["signed", "not_signed", "unsure"].includes(item.loanForm))
    )
      fail("invalid-argument", "Check each instrument and loan-form answer.");
    return {
      name,
      ownership: item.ownership,
      loan_form_status: item.ownership === "band" ? item.loanForm : "not_applicable",
      details,
    };
  });
  const instruments = instrument_details.map((item) => item.name).join(", ");
  if (instruments.length > 500) fail("invalid-argument", "Please shorten the instrument names.");
  return {
    display_name: name,
    instruments,
    instrument_details,
    notes,
    membership_requested: value.membershipRequested,
  };
}

function createRegistrationService({ db, auth, FieldValue, HttpsError }) {
  const fail = (code, message, details) => {
    throw new HttpsError(code, message, details);
  };
  const stamp = () => FieldValue.serverTimestamp();
  const indexRef = (type, value) =>
    db.doc(`profile_contacts/${createHash("sha256").update(`${type}:${value}`).digest("hex")}`);
  const contacts = (identity) => ({
    email: identity.emailVerified ? emailKey(identity.email) : "",
    phone: phoneKey(identity.phoneNumber),
  });
  const refs = (uid) => ({ profile: db.doc(`users/${uid}`), access: db.doc(`access/${uid}`) });
  const initialAccess = () => ({
    member: false,
    admin: false,
    analyticsId: randomUUID(),
    created_at: stamp(),
  });
  async function identity(uid) {
    try {
      return await auth.getUser(uid);
    } catch (error) {
      if (error.code === "auth/user-not-found") return null;
      throw error;
    }
  }
  function recent(token) {
    const age = Date.now() / 1000 - token?.auth_time;
    if (!Number.isFinite(age) || age < 0 || age > 900)
      fail("failed-precondition", "Sign in again before connecting accounts.");
  }
  async function ensureAccess(uid) {
    const ref = refs(uid).access;
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.data()?.deleted === true)
        fail("unauthenticated", "Sign in again using your connected email or phone.");
      if (!snapshot.exists) transaction.set(ref, initialAccess());
    });
  }
  function matchingContacts(profile, verified) {
    const email = emailKey(profile.email || profile.email_address);
    const phone = phoneKey(profile.phone || profile.phone_number || profile.phoneNumber);
    return {
      match: !!((email && email === verified.email) || (phone && phone === verified.phone)),
      needs:
        email && email !== verified.email
          ? "email"
          : phone && phone !== verified.phone
            ? "phone"
            : null,
    };
  }
  async function findLegacy(uid, verified) {
    const snapshot = await db.collection("users").get();
    const candidates = [];
    for (const document of snapshot.docs) {
      if (document.id === uid || document.data().merged_into) continue;
      const match = matchingContacts(document.data(), verified);
      if (!match.match) continue;
      // Another live Auth UID must be proved through the account-link operation.
      if (await identity(document.id))
        fail(
          "already-exists",
          "This contact matches a profile with another sign-in account. Connect that account or ask an administrator to review it.",
        );
      candidates.push({ id: document.id, data: document.data(), needs: match.needs });
    }
    if (candidates.length > 1)
      fail(
        "already-exists",
        "More than one profile matches. An administrator needs to review them.",
      );
    return candidates[0] || null;
  }
  async function reserveContacts(transaction, uid, verified, allowed = [], previous = {}) {
    const entries = Object.entries(verified).filter(([, value]) => value);
    const snapshots = await Promise.all(
      entries.map(([type, value]) => transaction.get(indexRef(type, value))),
    );
    for (const snapshot of snapshots) {
      const owner = snapshot.data()?.uid;
      if (owner && owner !== uid && !allowed.includes(owner))
        fail(
          "already-exists",
          "These contacts are connected to another profile. Please connect that account first.",
        );
    }
    const stale = Object.entries(previous).filter(
      ([type, value]) => value && value !== verified[type],
    );
    const old = await Promise.all(
      stale.map(([type, value]) => transaction.get(indexRef(type, value))),
    );
    return () => {
      entries.forEach(([type, value]) => transaction.set(indexRef(type, value), { uid, type }));
      old.forEach((snapshot, index) => {
        if (snapshot.data()?.uid === uid) transaction.delete(indexRef(...stale[index]));
      });
    };
  }
  async function syncContacts(uid, verified) {
    const current = refs(uid);
    await db.runTransaction(async (transaction) => {
      const [profile, access] = await Promise.all([
        transaction.get(current.profile),
        transaction.get(current.access),
      ]);
      if (!profile.exists || access.data()?.deleted || access.data()?.linking) return;
      const previous = {
        email: emailKey(profile.data().email),
        phone: phoneKey(profile.data().phone),
      };
      const reserve = await reserveContacts(transaction, uid, verified, [], previous);
      if (previous.email !== verified.email || previous.phone !== verified.phone)
        transaction.set(current.profile, verified, { merge: true });
      reserve();
    });
  }
  async function prepare(uid, user, resolve = false) {
    await ensureAccess(uid);
    const current = refs(uid);
    const [profile, access] = await Promise.all([current.profile.get(), current.access.get()]);
    if (access.data()?.linking) {
      const jobs = await db.collection("profile_links").where("canonicalUid", "==", uid).get();
      const ownJob = await db.doc(`profile_links/${uid}`).get();
      const job = ownJob.exists ? ownJob : jobs.docs[0];
      if (!job)
        fail(
          "failed-precondition",
          "An administrator needs to review this interrupted connection.",
        );
      const values = job.data();
      if (Date.now() - values.startedAt < 120000) return { state: "linkPending" };
      await recoverLink(values, job.ref);
      return { state: "retrySignIn" };
    }
    if (profile.data()?.merged_into)
      fail("unauthenticated", "Sign in again using your connected email or phone.");
    if (established(profile.data(), {})) {
      await syncContacts(uid, contacts(user));
      return { state: "complete", matched: false };
    }
    const verified = contacts(user);
    if (user.email && !user.emailVerified) return { state: "verifyEmail" };
    if (!verified.email && !verified.phone) return { state: "verifyEmail" };
    if (!resolve) return { state: "details", revision: revision(profile.data()) };
    const legacy = await findLegacy(uid, verified);
    if (!legacy) return { state: "details", revision: revision(profile.data()) };
    if (legacy.needs) return { state: "verifyContact", contactType: legacy.needs };
    const source = refs(legacy.id);
    await db.runTransaction(async (transaction) => {
      const [targetProfile, oldProfile, oldAccess, targetAccess] = await Promise.all([
        transaction.get(current.profile),
        transaction.get(source.profile),
        transaction.get(source.access),
        transaction.get(current.access),
      ]);
      if (
        !oldProfile.exists ||
        oldProfile.data().merged_into ||
        established(targetProfile.data(), {})
      )
        fail("aborted", "The profile changed. Check again before continuing.");
      if (oldAccess.data()?.admin)
        fail("permission-denied", "An administrator must connect this privileged profile.");
      if (
        oldAccess.data()?.deleted ||
        oldAccess.data()?.linking ||
        targetAccess.data()?.deleted ||
        targetAccess.data()?.linking
      )
        fail("aborted", "This profile is being changed. Check again before connecting it.");
      const check = matchingContacts(oldProfile.data(), verified);
      if (!check.match || check.needs)
        fail("aborted", "Verify the matching contact details again.");
      const reserve = await reserveContacts(transaction, uid, verified, [legacy.id]);
      const data = oldProfile.data();
      transaction.set(current.profile, {
        ...data,
        display_name: profileName(data),
        instruments: typeof data.instruments === "string" ? data.instruments : "",
        membership_requested: data.membership_requested === true,
        email: verified.email,
        phone: verified.phone,
        ...(established(data) ? { setup_completed_at: stamp() } : {}),
        updated_at: stamp(),
      });
      transaction.set(current.access, {
        ...(targetAccess.data() || initialAccess()),
        member: targetAccess.data()?.member === true || oldAccess.data()?.member === true,
        ...(typeof oldAccess.data()?.analyticsId === "string"
          ? { analyticsId: oldAccess.data().analyticsId }
          : {}),
      });
      transaction.set(source.profile, { merged_into: uid });
      transaction.set(source.access, { deleted: true });
      reserve();
    });
    const latest = await current.profile.get();
    return {
      state: established(latest.data()) ? "complete" : "details",
      matched: true,
      revision: revision(latest.data()),
    };
  }
  async function saveProfile(uid, user, data, creating) {
    const values = normalizeProfile(data.profile, fail);
    const verified = contacts(user);
    if (creating && user.email && !user.emailVerified)
      fail("failed-precondition", "Verify your email before completing setup.");
    if (!verified.email && !verified.phone)
      fail("failed-precondition", "Verify an email or phone before completing setup.");
    const ref = refs(uid);
    if (creating) {
      const legacy = await findLegacy(uid, verified);
      if (legacy)
        fail(
          "already-exists",
          "A matching profile was found. Check again to connect it before creating another.",
        );
    }
    await db.runTransaction(async (transaction) => {
      const [profile, access] = await Promise.all([
        transaction.get(ref.profile),
        transaction.get(ref.access),
      ]);
      if (access.data()?.deleted || access.data()?.linking)
        fail("failed-precondition", "Finish connecting your account before saving.");
      if (creating && established(profile.data(), {}))
        fail("aborted", "Your profile is already set up. Reload to view it.");
      if (!creating && !profile.exists) fail("not-found", "Complete account setup first.");
      if (typeof data.revision !== "string" || revision(profile.data()) !== data.revision)
        fail("aborted", "Your profile changed elsewhere. Reload before saving.");
      const reserve = await reserveContacts(transaction, uid, verified, [], {
        email: emailKey(profile.data()?.email),
        phone: phoneKey(profile.data()?.phone),
      });
      transaction.set(
        ref.profile,
        {
          ...values,
          email: verified.email,
          phone: verified.phone,
          setup_completed_at: profile.data()?.setup_completed_at || stamp(),
          updated_at: stamp(),
        },
        { merge: true },
      );
      if (!access.exists) transaction.set(ref.access, initialAccess());
      reserve();
    });
    return { state: "complete" };
  }

  async function unlockLink(job, jobRef) {
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(jobRef);
      if (current.data()?.operation !== job.operation) return;
      const entries = await Promise.all(
        [job.canonicalUid, job.sourceUid].map(async (uid) => [
          refs(uid).access,
          await transaction.get(refs(uid).access),
        ]),
      );
      for (const [ref, snapshot] of entries) {
        const { linking: _linking, ...values } = snapshot.data() || initialAccess();
        transaction.set(ref, values);
      }
      transaction.delete(jobRef);
    });
  }
  async function finalizeLink(job, jobRef) {
    const canonical = refs(job.canonicalUid);
    const source = refs(job.sourceUid);
    await db.runTransaction(async (transaction) => {
      const [a, b, aa, ba, current] = await Promise.all([
        transaction.get(canonical.profile),
        transaction.get(source.profile),
        transaction.get(canonical.access),
        transaction.get(source.access),
        transaction.get(jobRef),
      ]);
      if (current.data()?.operation !== job.operation)
        fail("aborted", "The connection changed. Sign in again to check it.");
      if (
        aa.data()?.deleted ||
        ba.data()?.deleted ||
        ba.data()?.admin ||
        (established(a.data(), aa.data()) && established(b.data(), ba.data()))
      )
        fail(
          "failed-precondition",
          "These profiles changed during connection and need administrator review.",
        );
      const verified = { email: job.email, phone: job.phone };
      const reserve = await reserveContacts(transaction, job.canonicalUid, verified, [
        job.sourceUid,
      ]);
      const fromPhone = established(b.data(), ba.data()) && !established(a.data(), aa.data());
      const profile = fromPhone ? b.data() : a.data();
      if (profile)
        transaction.set(canonical.profile, {
          ...profile,
          ...verified,
          ...(established(profile)
            ? { setup_completed_at: profile.setup_completed_at || stamp() }
            : {}),
          updated_at: stamp(),
        });
      const access = fromPhone ? ba.data() : aa.data();
      const { linking: _linking, ...permissions } = access || initialAccess();
      transaction.set(canonical.access, {
        ...permissions,
        member: aa.data()?.member === true || ba.data()?.member === true,
        admin: aa.data()?.admin === true,
      });
      transaction.set(source.profile, { merged_into: job.canonicalUid });
      transaction.set(source.access, { deleted: true });
      transaction.delete(jobRef);
      reserve();
    });
  }
  async function recoverLink(job, jobRef) {
    // Only a participant can reach this path, after the active operation's lease expires.
    const [target, source] = await Promise.all([
      identity(job.canonicalUid),
      identity(job.sourceUid),
    ]);
    if (!target?.emailVerified || emailKey(target.email) !== job.email)
      fail("failed-precondition", "An administrator needs to review this interrupted connection.");
    if (phoneKey(target?.phoneNumber) === job.phone) {
      await finalizeLink(job, jobRef);
      try {
        await auth.deleteUser(job.sourceUid);
      } catch {
        /* Revoked source is harmless. */
      }
    } else if (
      source &&
      !target?.phoneNumber &&
      (!source.phoneNumber || phoneKey(source.phoneNumber) === job.phone)
    ) {
      if (!source.phoneNumber) await auth.updateUser(job.sourceUid, { phoneNumber: job.phone });
      await unlockLink(job, jobRef);
    } else
      fail("failed-precondition", "An administrator needs to review this interrupted connection.");
  }

  async function link(uid, user, data, context) {
    recent(context.auth.token);
    if (typeof data.otherToken !== "string" || data.otherToken.length > 20000)
      fail("invalid-argument", "Verify the other sign-in method first.");
    const otherToken = await auth.verifyIdToken(data.otherToken, true);
    recent(otherToken);
    const other = await identity(otherToken.uid);
    if (!other) fail("unauthenticated", "Verify the other account again.");
    if (other.uid === uid) return { state: "linked" };
    const emailUser =
      user.emailVerified && user.email ? user : other.emailVerified && other.email ? other : null;
    const phoneUser = user.uid !== emailUser?.uid ? user : other;
    if (
      !emailUser ||
      !phoneUser.phoneNumber ||
      phoneUser.email ||
      phoneUser.providerData.some((provider) => provider.providerId !== "phone")
    )
      fail(
        "failed-precondition",
        "Both contacts must be verified. Accounts with conflicting email details need administrator review.",
      );
    const canonicalUid = emailUser.uid;
    const sourceUid = phoneUser.uid;
    const canonical = refs(canonicalUid);
    const source = refs(sourceUid);
    const jobRef = db.doc(`profile_links/${sourceUid}`);
    const phone = phoneKey(phoneUser.phoneNumber);
    const job = {
      canonicalUid,
      sourceUid,
      phone,
      email: emailKey(emailUser.email),
      operation: randomUUID(),
      startedAt: Date.now(),
    };
    if (emailUser.phoneNumber && phoneKey(emailUser.phoneNumber) !== phone)
      fail("already-exists", "The email account already has a different phone number.");
    await db.runTransaction(async (transaction) => {
      const [a, b, aa, ba, currentJob] = await Promise.all([
        transaction.get(canonical.profile),
        transaction.get(source.profile),
        transaction.get(canonical.access),
        transaction.get(source.access),
        transaction.get(jobRef),
      ]);
      if (aa.data()?.deleted || ba.data()?.deleted)
        fail("permission-denied", "This account is unavailable.");
      if (
        ba.data()?.admin ||
        (established(a.data(), aa.data()) && established(b.data(), ba.data()))
      )
        fail(
          "failed-precondition",
          "These existing profiles need administrator review before they can be combined.",
        );
      if (aa.data()?.linking || ba.data()?.linking || currentJob.exists)
        fail("aborted", "Another account connection is in progress.");
      transaction.set(canonical.access, { ...(aa.data() || initialAccess()), linking: true });
      transaction.set(source.access, { ...(ba.data() || initialAccess()), linking: true });
      transaction.set(jobRef, job);
    });
    try {
      await auth.updateUser(sourceUid, { phoneNumber: null });
      await auth.updateUser(canonicalUid, { phoneNumber: phone });
      await finalizeLink(job, jobRef);
    } catch (error) {
      // Before finalization, restore the original phone sign-in whenever possible.
      const stillPending = await jobRef.get();
      if (!stillPending.exists) {
        // The commit may have succeeded even when its response was lost.
        return { state: "linked", canonicalUid };
      }
      try {
        const target = await identity(canonicalUid);
        if (phoneKey(target?.phoneNumber) === phone)
          await auth.updateUser(canonicalUid, { phoneNumber: null });
        await auth.updateUser(sourceUid, { phoneNumber: phone });
        await unlockLink(job, jobRef);
      } catch {
        fail(
          "aborted",
          "The connection was interrupted. Sign in using your email and check again in two minutes.",
          { linkPending: true },
        );
      }
      throw error;
    }
    // The source has no remaining usable credentials; its profile is now an alias.
    try {
      await auth.deleteUser(sourceUid);
    } catch {
      /* Source access is already revoked in Firestore. */
    }
    return { state: "linked", canonicalUid };
  }

  async function handle(data, context) {
    const uid = context.auth?.uid;
    if (!uid) fail("unauthenticated", "Sign in to continue setup.");
    const user = await identity(uid);
    if (!user) fail("unauthenticated", "Sign in again using your connected email or phone.");
    if (data?.action === "prepare") return prepare(uid, user, data.resolve === true);
    if (data?.action === "complete") return saveProfile(uid, user, data, true);
    if (data?.action === "saveProfile") return saveProfile(uid, user, data, false);
    if (data?.action === "link") return link(uid, user, data, context);
    fail("invalid-argument", "Choose a valid setup action.");
  }
  return {
    handle,
    syncUserContacts: (user) => syncContacts(user.uid, contacts(user)),
    normalizeProfile: (value) => normalizeProfile(value, fail),
  };
}
module.exports = { createRegistrationService, normalizeProfile, revision, profileName };
