import React, { useRef, useState } from "react";
import { firebaseAuth } from "../../utils/Firebase";
import { writeStorage } from "../../utils/storage";
import { sendEmailLink } from "./emailLink";
import type { ActionCodeSettings } from "firebase/auth";
import { sendSignInLinkToEmail } from "firebase/auth";

interface EmailLinkSignInFormProps {
  setError: React.Dispatch<React.SetStateAction<string>>;
}

export const EmailLinkSignInForm: React.FC<EmailLinkSignInFormProps> = ({ setError }) => {
  const [emailAddress, setEmailAddress] = useState<string>("");
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  const [isSending, setIsSending] = useState(false);
  const sending = useRef(false);

  const actionCodeSettings: ActionCodeSettings = {
    // Clean return URL on this origin; Firebase uses its default email action domain.
    url: new URL("/#account", window.location.origin).href,
    handleCodeInApp: true,
  };

  const handleSignInWithLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setIsSending(true);
    setError("");

    try {
      await sendEmailLink(
        emailAddress,
        (email) => sendSignInLinkToEmail(firebaseAuth, email, actionCodeSettings),
        (email) => writeStorage(() => window.localStorage, "signInEmail", email),
      );

      setIsSubmitted(true);
    } catch (error) {
      handleError(error);
    } finally {
      sending.current = false;
      setIsSending(false);
    }
  };

  const handleError = (error: unknown) => {
    const code =
      typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    switch (code) {
      case "auth/invalid-email":
        setError("Enter a valid email address.");
        break;
      case "auth/network-request-failed":
        setError("Check your connection and try again.");
        break;
      case "auth/too-many-requests":
        setError("Too many requests. Please wait a few minutes and try again.");
        break;
      default:
        setError("Unable to send the sign-in link. Please try again later.");
        console.error("Error sending sign-in link:", error);
    }
  };

  return (
    <div className="email-link-sign-in-container">
      {!isSubmitted && ( // Enter email to sign in
        <form
          className="email-link-sign-in-form"
          onSubmit={handleSignInWithLinkSubmit}
          aria-busy={isSending}
        >
          <input
            className="input-text"
            type="email"
            value={emailAddress}
            onChange={(e) => setEmailAddress(e.target.value)}
            placeholder="Enter your email"
            aria-label="Email address"
            autoComplete="email"
            disabled={isSending}
            required
          />
          <button className="button account-button" type="submit" disabled={isSending}>
            <span className="button-icon" aria-hidden="true"></span>
            <span className="button-text">{isSending ? "Sending..." : "Send Sign In Link"}</span>
          </button>
        </form>
      )}
      {isSubmitted && (
        <>
          <form className="email-link-sign-in-form">
            <input
              className="input-text"
              type="email"
              value={emailAddress}
              aria-label="Email address"
              disabled={true}
            />
          </form>
          <p className="email-link-sign-in-message" role="status">
            Check your email for the link to sign in.
            <br />
            <br />
            It may take up to 5 minutes. If you do not receive the email, check your junk/spam
            folder or refresh this page and try again.
          </p>
        </>
      )}
    </div>
  );
};
