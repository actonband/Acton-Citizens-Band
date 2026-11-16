import { measureDashboardAuth } from "../../utils/analytics";
import React, { useEffect, useRef, useState } from "react";
import {
  EmailAuthProvider,
  RecaptchaVerifier,
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  linkWithPhoneNumber,
  linkWithCredential,
  sendPasswordResetEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from "firebase/auth";
import type { Auth, ConfirmationResult, User } from "firebase/auth";
import { firebaseAuth } from "../../utils/firebase";
import { readStorage, removeStorage } from "../../utils/storage";
import { formatPhoneNumber, normalizePhoneNumber, phoneNumberError } from "../../utils/phone";
import { validateNewPassword } from "../../utils/passwordPolicy";
import NewPasswordInput from "./NewPasswordInput";

export function authError(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? error.code : "";
  switch (code) {
    case "auth/email-already-in-use":
    case "auth/credential-already-in-use":
      return "This sign-in method belongs to an existing account. Sign in to that account to continue.";
    case "auth/provider-already-linked":
      return "This sign-in method is already connected to your account.";
    case "auth/requires-recent-login":
      return "Sign out and sign in again, then retry this change.";
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      return "Choose a password that meets all the requirements shown above.";
    case "auth/password-policy-unavailable":
      return "Unable to check the password requirements. Check your connection and try again.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/invalid-phone-number":
      return "Enter a valid phone number.";
    case "auth/invalid-verification-code":
      return "The verification code is incorrect. Check the text message and try again.";
    case "auth/code-expired":
      return "This code has expired. Request another text message.";
    case "auth/invalid-action-code":
    case "auth/expired-action-code":
      return "This email link is invalid or expired. Use your password or reset it.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait before trying again.";
    case "auth/unauthorized-domain":
      return "This hostname must be authorized in Firebase Authentication settings.";
    case "auth/operation-not-allowed":
      return "This sign-in method needs enabling in Firebase Authentication.";
    case "auth/quota-exceeded":
      return "Text-message delivery is temporarily unavailable. Try again later or use email.";
    case "auth/captcha-check-failed":
      return "Verification failed. Please retry the security check.";
    case "auth/invalid-app-credential":
    case "auth/missing-app-credential":
      return typeof location !== "undefined" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
        ? "Phone verification could not validate this local page. Test real SMS from an authorized hosted dashboard."
        : "Phone verification could not validate this app. Reload the page and complete the security check again.";
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Unable to sign in with these details. Check your password, reset it, or choose Create an account.";
    default:
      return "Unable to complete this action. Check your details and connection, then try again.";
  }
}

export default function Login({
  linking = false,
  onLinked,
  onCancel,
  contactType,
  embedded = false,
  auth = firebaseAuth,
  onAuthenticated,
}: {
  linking?: boolean;
  onLinked?: () => void;
  onCancel?: () => void;
  contactType?: "email" | "phone";
  embedded?: boolean;
  auth?: Auth;
  onAuthenticated?: (user: User) => void | Promise<void>;
}) {
  const [emailLink, setEmailLink] = useState(
    () => !linking && isSignInWithEmailLink(firebaseAuth, location.href),
  );
  const [identifier, setIdentifier] = useState(() =>
    emailLink ? readStorage(() => localStorage, "signInEmail") || "" : "",
  );
  const [step, setStep] = useState<"identifier" | "password" | "code">("identifier");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const captchaContainer = useRef<HTMLDivElement>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);
  const confirmation = useRef<ConfirmationResult | null>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const identifierInput = useRef<HTMLInputElement>(null);
  const lookupVersion = useRef(0);

  useEffect(
    () => () => {
      verifier.current?.clear();
      verifier.current = null;
    },
    [],
  );
  useEffect(() => {
    if (step === "identifier" && linking && embedded) identifierInput.current?.focus();
    if (step === "password") passwordInput.current?.focus();
    if (step === "code") codeInput.current?.focus();
  }, [step, linking, embedded]);

  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : "";
      const safeCode = typeof code === "string" && /^auth\/[a-z0-9-]+$/.test(code) ? code : "";
      setError(authError(error) + (safeCode ? ` (${safeCode})` : ""));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function sendCode() {
    const phone = normalizePhoneNumber(identifier);
    if (!phone) {
      setError(phoneNumberError(identifier));
      return;
    }
    setIdentifier(formatPhoneNumber(phone));
    if (!captchaContainer.current) return;
    verifier.current?.clear();
    verifier.current = new RecaptchaVerifier(auth, captchaContainer.current, { size: "normal" });
    try {
      confirmation.current =
        linking && firebaseAuth.currentUser
          ? await linkWithPhoneNumber(firebaseAuth.currentUser, phone, verifier.current)
          : await signInWithPhoneNumber(auth, phone, verifier.current);
      setIdentifier(formatPhoneNumber(phone));
      setCode("");
      setStep("code");
    } finally {
      verifier.current?.clear();
      verifier.current = null;
    }
  }

  async function checkEmail(value: string) {
    const email = value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    const version = lookupVersion.current;
    if (!linking) {
      const methods = await fetchSignInMethodsForEmail(auth, email);
      if (version !== lookupVersion.current) return;
      setRegister(methods.length === 0);
    }
    setIdentifier(email);
    setStep("password");
  }

  function back() {
    setStep("identifier");
    setPassword("");
    setCode("");
    setRegister(false);
    setError("");
    setMessage("");
    confirmation.current = null;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (emailLink) {
        await measureDashboardAuth("sign_in", "email", () =>
          signInWithEmailLink(firebaseAuth, identifier.trim(), location.href),
        );
        removeStorage(() => localStorage, "signInEmail");
        history.replaceState(null, "", "/dashboard/");
        setEmailLink(false);
      } else if (step === "identifier") {
        if (identifier.includes("@")) {
          await checkEmail(identifier);
        } else await sendCode();
      } else if (step === "code") {
        if (!confirmation.current) {
          back();
          return;
        }
        const verification = confirmation.current;
        const result = await measureDashboardAuth(
          linking ? "link" : "sign_in_or_sign_up",
          "phone",
          () => verification.confirm(code.trim()),
        );
        confirmation.current = null;
        setCode("");
        if (linking) {
          back();
          setMessage("Phone number connected to your account.");
          onLinked?.();
        } else await onAuthenticated?.(result.user);
      } else if (linking && firebaseAuth.currentUser) {
        await validateNewPassword(auth, password);
        const currentUser = firebaseAuth.currentUser;
        await measureDashboardAuth("link", "email", () =>
          linkWithCredential(currentUser, EmailAuthProvider.credential(identifier, password)),
        );
        back();
        setMessage("Email and password connected to your account.");
        onLinked?.();
      } else if (register) {
        await validateNewPassword(auth, password);
        const result = await measureDashboardAuth("sign_up", "email", () =>
          createUserWithEmailAndPassword(auth, identifier, password),
        );
        setPassword("");
        if (onAuthenticated) await onAuthenticated(result.user);
      } else {
        const result = await measureDashboardAuth("sign_in", "email", () =>
          signInWithEmailAndPassword(auth, identifier, password),
        );
        setPassword("");
        if (onAuthenticated) await onAuthenticated(result.user);
      }
    });
  }

  const Container = embedded ? "div" : "section";
  const heading = linking
    ? `Add ${contactType === "email" ? "Email" : contactType === "phone" ? "Phone" : "Email Or Phone"}`
    : register
      ? "Create Your Account"
      : "Sign In";
  const contactLabel =
    contactType === "email"
      ? "Email address"
      : contactType === "phone"
        ? "Phone number"
        : "Email or phone number";
  const isPhoneEntry =
    step === "identifier" &&
    !emailLink &&
    (contactType === "phone" ||
      (!identifier.includes("@") && /^[+\d\p{Ps}]/u.test(identifier.trim())));
  return (
    <Container className="dashboard-auth" aria-label={heading}>
      {linking && !embedded ? (
        <h3>{heading}</h3>
      ) : !linking && !embedded ? (
        <h1>{heading}</h1>
      ) : null}
      {step === "code" && <p>Enter the code sent to {identifier}.</p>}
      <form onSubmit={submit} aria-busy={busy}>
        {(step !== "code" || emailLink) && (
          <label>
            {emailLink ? "Confirm your email address" : contactLabel}
            <input
              ref={identifierInput}
              type={
                emailLink || contactType === "email"
                  ? "email"
                  : contactType === "phone"
                    ? "tel"
                    : "text"
              }
              autoComplete={
                contactType === "phone" ? "tel" : contactType === "email" ? "email" : "username"
              }
              required
              disabled={busy}
              value={identifier}
              onChange={(event) => {
                lookupVersion.current++;
                setIdentifier(event.target.value);
                setStep("identifier");
                setPassword("");
                setRegister(false);
                setError("");
              }}
              onBlur={(event) => {
                if (!emailLink && contactType !== "email" && !event.target.value.includes("@"))
                  setIdentifier(formatPhoneNumber(event.target.value));
                else if (!emailLink && step === "identifier" && event.target.value.includes("@"))
                  void run(() => checkEmail(event.target.value));
              }}
              placeholder={
                contactType === "email"
                  ? "you@example.com"
                  : contactType === "phone"
                    ? "519 555 0123"
                    : undefined
              }
            />
          </label>
        )}
        {step === "password" && (register || linking) ? (
          <NewPasswordInput
            auth={auth}
            label="Create a password"
            value={password}
            onChange={setPassword}
            disabled={busy}
            inputRef={passwordInput}
          />
        ) : (
          step === "password" && (
            <label>
              {register || linking ? "Create a password" : "Password"}
              <input
                ref={passwordInput}
                type="password"
                autoComplete={register || linking ? "new-password" : "current-password"}
                required
                disabled={busy}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          )
        )}
        {step === "code" && (
          <label>
            Verification code
            <input
              ref={codeInput}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              disabled={busy}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
        )}
        <div ref={captchaContainer} className="dashboard-captcha" />
        {isPhoneEntry && (
          <p className="dashboard-auth-note">
            Google stores phone numbers for spam and abuse prevention. SMS rates may apply.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <div
          className={`dashboard-actions ${embedded && linking ? "dashboard-contact-actions" : "dashboard-submit-actions"}`}
        >
          <button className="dashboard-primary-button" disabled={busy}>
            {busy
              ? "Please Wait…"
              : emailLink
                ? "Complete Sign-In"
                : step === "identifier"
                  ? contactType === "phone"
                    ? "Send Verification Code"
                    : "Continue"
                  : step === "code"
                    ? linking
                      ? "Verify And Save Phone"
                      : "Verify Code"
                    : linking
                      ? "Save Email"
                      : register
                        ? "Create Account"
                        : "Sign In"}
          </button>
          {onCancel && (
            <button
              type="button"
              disabled={busy}
              className="dashboard-secondary-button"
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
      <div className="dashboard-actions dashboard-auth-options">
        {step !== "identifier" && (
          <button disabled={busy} onClick={back}>
            {contactType === "phone"
              ? "Change Phone Number"
              : contactType === "email"
                ? "Change Email Address"
                : "Use A Different Email Or Phone"}
          </button>
        )}
        {step === "password" && !linking && (
          <>
            <button
              disabled={busy}
              onClick={() => {
                setRegister(!register);
                setPassword("");
                setError("");
              }}
            >
              {register ? "Sign In To An Existing Account" : "Create An Account"}
            </button>
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await sendPasswordResetEmail(firebaseAuth, identifier);
                  setMessage(
                    "If this email has an eligible account, a password-reset email will arrive shortly.",
                  );
                })
              }
            >
              Forgot Password?
            </button>
          </>
        )}
        {step === "code" && (
          <button disabled={busy} onClick={() => run(sendCode)}>
            Send Another Code
          </button>
        )}
        {emailLink && (
          <button
            disabled={busy}
            onClick={() => {
              setEmailLink(false);
              history.replaceState(null, "", "/dashboard/");
              back();
            }}
          >
            Use Email Or Phone Sign-In
          </button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
    </Container>
  );
}
