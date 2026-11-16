import { useRef, useState, useEffect } from "react";
import { applyActionCode } from "firebase/auth";
import { firebaseAuth } from "../../utils/firebase";

export default function VerifyEmail() {
  const [state, setState] = useState("Verifying your email…");
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = new URLSearchParams(location.search).get("oobCode");
    history.replaceState(null, "", "/dashboard/");
    if (!code) {
      setState("This verification link is missing its code. Request another verification email.");
      return;
    }
    void applyActionCode(firebaseAuth, code)
      .then(() =>
        setState(
          "Your email is verified. Return to the account form to continue, or open the dashboard.",
        ),
      )
      .catch(() =>
        setState(
          "This verification link is invalid or expired. Request another verification email from your account form.",
        ),
      );
  }, []);
  return (
    <div className="dashboard">
      <main className="dashboard-login">
        <section>
          <h1>Email Verification</h1>
          <p role="status">{state}</p>
          <a href="/dashboard/">Open Dashboard</a>
        </section>
      </main>
    </div>
  );
}
