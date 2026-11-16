import React, { useEffect, useRef, useState } from "react";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { firebaseAuth } from "../../utils/firebase";
import NewPasswordInput from "./NewPasswordInput";
import { validateNewPassword } from "../../utils/passwordPolicy";

function resetError(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? error.code : "";
  switch (code) {
    case "auth/expired-action-code":
    case "auth/invalid-action-code":
      return "This reset link has expired or has already been used. Return to sign-in and request a new link.";
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      return "Choose a password that meets all the requirements shown above.";
    case "auth/password-policy-unavailable":
      return "Unable to check the password requirements. Check your connection and try again.";
    case "auth/user-disabled":
    case "auth/user-not-found":
      return "This account is unavailable. Contact the band administrator for help.";
    default:
      return "Unable to complete the request. Check your connection and try again.";
  }
}

export default function ResetPassword() {
  const [actionCode] = useState(() => new URLSearchParams(location.search).get("oobCode") || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [checking, setChecking] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  useEffect(() => {
    let active = true;
    setChecking(true);
    setError("");
    if (!actionCode) {
      setError(
        "This reset link is missing its verification code. Request a new password-reset email.",
      );
      setChecking(false);
      return;
    }
    // Verification checks the link without consuming it or changing the password.
    verifyPasswordResetCode(firebaseAuth, actionCode)
      .then((address) => {
        if (active) setEmail(address);
      })
      .catch((error) => {
        if (active) setError(resetError(error));
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [actionCode, attempt]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || checking || !email || complete) return;
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await validateNewPassword(firebaseAuth, password);
      await confirmPasswordReset(firebaseAuth, actionCode, password);
      setComplete(true);
      setPassword("");
      setConfirmation("");
      setEmail("");
      history.replaceState(null, "", "/dashboard/");
    } catch (error) {
      setError(resetError(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="dashboard">
      <header>
        <a className="dashboard-brand" href="/">
          <img
            src="/img/branding/ACB-Logo-Red-Transparent.svg"
            width="64"
            height="64"
            alt="Acton Citizens’ Band home"
          />
        </a>
        <span className="dashboard-page-label">Dashboard</span>
      </header>
      <main className="dashboard-login">
        <section className="dashboard-auth">
          <h1>{complete ? "Password Updated" : "Reset Your Password"}</h1>
          {checking && <p role="status">Checking your reset link…</p>}
          {complete ? (
            <p role="status">Your new password is ready. You can now sign in.</p>
          ) : (
            !checking &&
            email && (
              <>
                <p>{email}</p>
                <form onSubmit={submit} aria-busy={busy}>
                  <NewPasswordInput
                    auth={firebaseAuth}
                    label="New Password"
                    value={password}
                    onChange={setPassword}
                    disabled={busy}
                  />
                  <label>
                    Confirm New Password
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      disabled={busy}
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                    />
                  </label>
                  <button className="dashboard-primary-button" disabled={busy}>
                    {busy ? "Saving…" : "Save New Password"}
                  </button>
                </form>
              </>
            )
          )}
          {error && <p role="alert">{error}</p>}
          {!checking && !email && !complete && actionCode && (
            <button onClick={() => setAttempt((value) => value + 1)}>Retry Checking Link</button>
          )}
          <p>
            <a href="/dashboard/">Return to sign-in</a>
          </p>
        </section>
      </main>
    </div>
  );
}
