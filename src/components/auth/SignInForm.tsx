import React, { useState } from "react";
import { EmailLinkSignInForm } from "./EmailLinkSignInForm";
import { useAuth } from "./AuthContext";

const SignIn: React.FC = () => {
  const { user, authSignOut } = useAuth();
  const [error, setError] = useState<string>("");

  const accountContent = user ? (
    <>
      <p>Email: {user.email}</p>
      <button className="button account-button" onClick={authSignOut}>
        Sign Out
      </button>
    </>
  ) : (
    <>
      <p>Log in to access band resources and updates.</p>
      <div className="sign-in-container">
        {error && (
          <div className="sign-in-error" role="alert" style={{ color: "red" }}>
            {error}
          </div>
        )}
        <div className="sign-in-methods-container">
          <EmailLinkSignInForm setError={setError} />
        </div>
      </div>
    </>
  );

  return accountContent;
};

export default SignIn;
