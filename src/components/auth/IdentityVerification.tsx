import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  EmailAuthProvider,
  fetchSignInMethodsForEmail,
  reauthenticateWithCredential,
  reauthenticateWithPhoneNumber,
  RecaptchaVerifier,
} from "firebase/auth";
import type { Auth, ConfirmationResult } from "firebase/auth";
import { firebaseAuth } from "../../utils/firebase";
import { formatPhoneNumber } from "../../utils/phone";
import { measureDashboardAuth } from "../../utils/analytics";
import { authError } from "./Login";

export type IdentityVerificationHandle = { verify: () => Promise<boolean> };
type Methods = { email: string; phone: string; password: boolean };

// Fields only: the containing Save/Delete button owns verification and the mutation.
const IdentityVerification = forwardRef<
  IdentityVerificationHandle,
  {
    onError: (message: string) => void;
    auth?: Auth;
  }
>(function IdentityVerification({ onError, auth = firebaseAuth }, ref) {
  const actor = useRef(auth.currentUser);
  const active = useRef(true);
  const pending = useRef(false);
  const [methods, setMethods] = useState<Methods | null>(null);
  const [method, setMethod] = useState<"password" | "phone" | null>(null);
  const [checking, setChecking] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const captcha = useRef<HTMLDivElement>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);
  const confirmation = useRef<ConfirmationResult | null>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    active.current = true;
    const user = actor.current;
    let current = true;
    setChecking(true);
    async function resolveMethods() {
      try {
        if (!user || auth.currentUser?.uid !== user.uid) throw new Error("account-changed");
        const email = user.email || "";
        const phone = user.phoneNumber || "";
        const signInMethods = email ? await fetchSignInMethodsForEmail(auth, email) : [];
        if (!current) return;
        const password = signInMethods.includes("password");
        setMethods({ email, phone, password });
        setMethod(password ? "password" : phone ? "phone" : null);
      } catch {
        if (!current) return;
        // A linked phone remains usable when password-method discovery is unavailable.
        if (user?.phoneNumber && auth.currentUser?.uid === user.uid) {
          setMethods({ email: user.email || "", phone: user.phoneNumber, password: false });
          setMethod("phone");
        } else {
          setMethods(null);
          onError("Unable to load your verification methods. Retry or sign out and sign in again.");
        }
      } finally {
        if (current) setChecking(false);
      }
    }
    void resolveMethods();
    return () => {
      current = false;
      active.current = false;
      verifier.current?.clear();
      verifier.current = null;
      confirmation.current = null;
    };
  }, [auth, attempt, onError]);

  useEffect(() => {
    if (method === "password") passwordInput.current?.focus();
    if (method === "phone" && codeSent) codeInput.current?.focus();
  }, [method, codeSent]);

  function switchMethod(next: "password" | "phone") {
    verifier.current?.clear();
    verifier.current = null;
    confirmation.current = null;
    setPassword("");
    setCode("");
    setCodeSent(false);
    setMethod(next);
    onError("");
  }

  useImperativeHandle(ref, () => ({
    async verify() {
      if (pending.current || checking) return false;
      pending.current = true;
      onError("");
      try {
        const user = auth.currentUser;
        if (!active.current || !user || user.uid !== actor.current?.uid)
          throw new Error("account-changed");
        if (!methods || !method) {
          onError("Sign out and sign in again to verify your identity, then retry this change.");
          return false;
        }
        if (
          (method === "password" && user.email !== methods.email) ||
          (method === "phone" && user.phoneNumber !== methods.phone)
        )
          throw new Error("account-changed");
        if (method === "phone" && !confirmation.current) {
          if (!captcha.current) throw new Error("captcha-unavailable");
          verifier.current?.clear();
          verifier.current = new RecaptchaVerifier(auth, captcha.current, { size: "normal" });
          const result = await reauthenticateWithPhoneNumber(user, methods.phone, verifier.current);
          if (!active.current || auth.currentUser?.uid !== user.uid) return false;
          confirmation.current = result;
          setCode("");
          setCodeSent(true);
          return false; // The next Save submits the fresh code and then the pending change.
        }
        if (method === "password" && !password) {
          onError("Enter your password to verify your identity.");
          return false;
        }
        if (method === "phone" && !/^\d{6}$/.test(code)) {
          onError("Enter the six-digit verification code.");
          return false;
        }
        await measureDashboardAuth(
          "reauthenticate",
          method === "phone" ? "phone" : "email",
          async () => {
            if (method === "password")
              await reauthenticateWithCredential(
                user,
                EmailAuthProvider.credential(methods.email, password),
              );
            else await confirmation.current!.confirm(code);
            // The following callable must receive the refreshed auth_time.
            await user.getIdToken(true);
          },
        );
        if (!active.current || auth.currentUser?.uid !== user.uid) return false;
        setPassword("");
        setCode("");
        confirmation.current = null;
        return true;
      } catch (error) {
        if (active.current) {
          const code = error && typeof error === "object" && "code" in error ? error.code : "";
          onError(
            error instanceof Error && error.message === "account-changed"
              ? "Your sign-in account changed. Reload the page and try again."
              : method === "password" &&
                  [
                    "auth/wrong-password",
                    "auth/invalid-credential",
                    "auth/invalid-login-credentials",
                  ].includes(String(code))
                ? "The password is incorrect. Please try again."
                : authError(error),
          );
        }
        return false;
      } finally {
        verifier.current?.clear();
        verifier.current = null;
        pending.current = false;
      }
    },
  }));

  return (
    <div className="identity-verification">
      <h3>Verify Your Identity</h3>
      {checking ? (
        <p role="status">Checking verification methods…</p>
      ) : method === "password" ? (
        <label>
          Password
          <input
            ref={passwordInput}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              onError("");
            }}
          />
        </label>
      ) : method === "phone" ? (
        codeSent ? (
          <>
            <p>Enter the code sent to {formatPhoneNumber(methods?.phone || "")}.</p>
            <label>
              Verification Code
              <input
                ref={codeInput}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(event) => {
                  setCode(event.target.value);
                  onError("");
                }}
              />
            </label>
          </>
        ) : (
          <p>
            A new verification code will be sent to {formatPhoneNumber(methods?.phone || "")} when
            you submit this change.
          </p>
        )
      ) : (
        <p>Sign out and sign in again to verify your identity.</p>
      )}
      <div ref={captcha} className="dashboard-captcha" />
      <div className="dashboard-actions dashboard-auth-options">
        {!checking && methods?.password && method !== "password" && (
          <button type="button" onClick={() => switchMethod("password")}>
            Use Password
          </button>
        )}
        {!checking && methods?.phone && method !== "phone" && (
          <button type="button" onClick={() => switchMethod("phone")}>
            Use SMS Code
          </button>
        )}
        {method === "phone" && codeSent && (
          <button type="button" onClick={() => switchMethod("phone")}>
            Use A New Code
          </button>
        )}
        {!checking && !methods && (
          <button
            type="button"
            onClick={() => {
              onError("");
              setAttempt((value) => value + 1);
            }}
          >
            Retry Verification Methods
          </button>
        )}
      </div>
    </div>
  );
});

export default IdentityVerification;
