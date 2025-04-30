import React, { useState } from "react";
import { EmailSignIn } from "./EmailSignIn";
import { useAuth, AuthProviderOption } from "./AuthContext";

// TODO
  // - Implement firestore db to store user data
  // - Implement a form to update user data
  // - Implement a method do delete a user's account and data
  // - Implement a functionality to check if a user is a member of the band/junior band or just subscribed to alerts, etc.
  // - Use this? https://developers.google.com/identity/gsi/web/guides/display-button
  // - Create login and logout endpoints to use with firebase?
  // - Give click bait button for subscribing to practice cancellation notifications and then make them fill in member form to sign up

const SignIn: React.FC = () => {
  const { user, signInWithProviderPopup, authSignOut } = useAuth();
  const [error, setError] = useState<string>('');

  const userIsMember = false;

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
        {error && <div className="sign-in-error" style={{ color: "red" }}>{error}</div>}
        <div className="sign-in-methods-container">
          <EmailSignIn setError={setError}/>
          <div className="button-container">
            <button className="button button-google" onClick={() => {signInWithProviderPopup(AuthProviderOption.Google)}}>
              <span className="button-icon"></span>
              <span className="button-text">Sign In with Google</span>
            </button>
            <button className="button button-microsoft" onClick={() => {signInWithProviderPopup(AuthProviderOption.Microsoft)}}>
              <span className="button-icon"></span>
              <span className="button-text">Sign In with Microsoft</span>
            </button>
            <button className="button button-facebook" onClick={() => {signInWithProviderPopup(AuthProviderOption.Facebook)}}>
              <span className="button-icon"></span>
              <span className="button-text">Sign In with Facebook</span>
            </button>
            <button className="button button-yahoo" onClick={() => {signInWithProviderPopup(AuthProviderOption.Yahoo)}}>
              <span className="button-icon"></span>
              <span className="button-text">Sign In with Yahoo</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return accountContent;
};

export default SignIn;
