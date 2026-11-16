import { useEffect, useRef, useState } from "react";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  inMemoryPersistence,
  setPersistence,
  signOut,
  reload,
  updateCurrentUser,
} from "firebase/auth";
import type { Auth, User } from "firebase/auth";
import { firebaseApp, firebaseAuth } from "../../utils/firebase";
import Login, { authError } from "../auth/Login";
import EmailVerification from "../auth/EmailVerification";
import ProfileFormFields from "./ProfileFormFields";
import { registration, registrationError, profileDraft } from "./registration";
import type { SetupResult } from "./registration";

export default function AccountSetup({
  user,
  initial,
  onComplete,
}: {
  user: User;
  initial: SetupResult;
  onComplete: () => void;
}) {
  const defaultMissing =
    initial.contactType || (!user.email ? "email" : !user.phoneNumber ? "phone" : null);
  const [missing, setMissing] = useState(defaultMissing);
  const [phase, setPhase] = useState<
    "contact" | "add" | "verify" | "details" | "pending" | "checking"
  >(
    initial.state === "linkPending" || initial.state === "retrySignIn"
      ? "pending"
      : missing
        ? "contact"
        : initial.state === "verifyEmail"
          ? "verify"
          : "checking",
  );
  const [secondary, setSecondary] = useState<Auth | null>(null);
  const other = useRef<User | null>(null);
  const [revision, setRevision] = useState(initial.revision || "");
  const [draft, setDraft] = useState(() => profileDraft({}));
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const app = initializeApp(firebaseApp.options, `contact-verification-${crypto.randomUUID()}`);
    const auth = getAuth(app);
    let active = true;
    void setPersistence(auth, inMemoryPersistence)
      .then(() => {
        if (active) setSecondary(auth);
      })
      .catch(() => {
        if (active) setError("Unable to start contact verification. Reload to retry.");
      });
    return () => {
      active = false;
      void signOut(auth)
        .then(
          () => deleteApp(app),
          () => deleteApp(app),
        )
        .catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!defaultMissing && initial.state === "details") void run(check);
  }, []);

  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await action();
    } catch (failure) {
      if (
        failure &&
        typeof failure === "object" &&
        "details" in failure &&
        (failure.details as { linkPending?: boolean })?.linkPending
      )
        setPhase("pending");
      const code =
        failure && typeof failure === "object" && "code" in failure ? String(failure.code) : "";
      setError(code.startsWith("auth/") ? authError(failure) : registrationError(failure));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function check() {
    await reload(user);
    if (phase === "pending") {
      const result = await registration({ action: "prepare" });
      if (result.state === "complete") onComplete();
      else if (result.state === "retrySignIn")
        setStatus("Connection recovered. Sign out and sign in again using your email or phone.");
      return;
    }
    if (other.current) await reload(other.current);
    const email = user.email ? user : other.current?.email ? other.current : null;
    if (email && !email.emailVerified) {
      if (phase === "verify")
        setStatus("Your email is not verified yet. Open the link in your inbox, then check again.");
      setPhase("verify");
      return;
    }
    if (other.current && other.current.uid !== user.uid) {
      const linked = await registration({
        action: "link",
        otherToken: await other.current.getIdToken(true),
      });
      if (linked.canonicalUid) {
        const canonical = linked.canonicalUid === user.uid ? user : other.current;
        if (canonical.uid !== linked.canonicalUid)
          throw new Error("Unrecognized connected account.");
        await reload(canonical);
        await canonical.getIdToken(true);
        await updateCurrentUser(firebaseAuth, canonical);
        onComplete();
        return;
      }
    }
    await user.getIdToken(true);
    const result = await registration({ action: "prepare", resolve: true });
    if (result.state === "complete") onComplete();
    else if (result.state === "verifyContact") {
      setMissing(result.contactType || null);
      setPhase("add");
      setStatus(`An existing profile matches. Verify its ${result.contactType} to connect it.`);
    } else if (result.state === "verifyEmail") setPhase("verify");
    else if (result.state === "linkPending") setPhase("pending");
    else if (result.state === "retrySignIn") {
      setPhase("pending");
      setStatus("Connection recovered. Sign out and sign in again using your email or phone.");
    } else {
      setRevision(result.revision || "");
      setPhase("details");
    }
  }
  const emailUser =
    user.email && !user.emailVerified ? user : other.current?.email ? other.current : user;
  return (
    <section className="account-setup">
      <h1>Complete Your Account</h1>
      <p className="dashboard-auth-note">{user.email || user.phoneNumber}</p>
      {phase === "checking" && (
        <>
          <p role="status">Checking for an existing profile…</p>
          {error && <button onClick={() => void run(check)}>Retry</button>}
        </>
      )}
      {phase === "contact" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(check);
          }}
        >
          <h2>Add {missing === "email" ? "Email" : "Phone"}?</h2>
          <p>
            Connect an {missing === "email" ? "email address" : "SMS phone number"} so you can use
            either contact to sign in. We will verify it and check for an existing profile.
          </p>
          <div className="dashboard-actions">
            <button
              className="dashboard-primary-button"
              type="button"
              disabled={busy || !secondary}
              onClick={() => setPhase("add")}
            >
              Add {missing === "email" ? "Email" : "Phone"}
            </button>
            <button disabled={busy} className="dashboard-secondary-button">
              {busy ? "Checking…" : "Skip For Now"}
            </button>
          </div>
        </form>
      )}
      {phase === "add" && secondary && (
        <>
          <h2>Verify {missing === "email" ? "Email" : "Phone"}</h2>
          <Login
            embedded
            auth={secondary}
            contactType={missing || undefined}
            onAuthenticated={async (verified) => {
              other.current = verified;
              await run(check);
            }}
            onCancel={() => {
              other.current = null;
              void signOut(secondary);
              setPhase("contact");
            }}
          />
        </>
      )}
      {phase === "verify" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(check);
          }}
        >
          <h2>Verify Your Email</h2>
          <p>
            Verify {emailUser.email} using the link in your inbox, then return here to continue.
          </p>
          <EmailVerification
            user={emailUser}
            disabled={busy}
            showUnverifiedMessage={false}
            primaryAction={
              <button disabled={busy} className="dashboard-primary-button">
                {busy ? "Checking…" : "I’ve Verified My Email"}
              </button>
            }
          />
        </form>
      )}
      {phase === "details" && (
        <form
          aria-busy={busy}
          data-dirty={Boolean(draft.name || draft.instrumentDetails.length || draft.notes)}
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await registration({ action: "complete", profile: draft, revision });
              onComplete();
            });
          }}
        >
          <p>Tell us a little about yourself.</p>
          <fieldset disabled={busy}>
            <ProfileFormFields value={draft} onChange={setDraft} membership />
            <div className="dashboard-actions">
              <button className="dashboard-primary-button">
                {busy ? "Saving…" : "Complete Account"}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {phase === "pending" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(check);
          }}
        >
          <p>
            An account connection is still being checked. Wait two minutes before retrying. You can
            also sign out and return using your email or phone.
          </p>
          <button disabled={busy}>Check Connection</button>
        </form>
      )}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
