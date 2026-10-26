import React, { useState } from "react";
import { EmailLinkSignInForm } from "./EmailLinkSignInForm";
import { useAuth } from "./AuthContext";

// TODO
  // - Implement firestore db to store user data
  // - Implement a form to update user data
  // - Implement a method do delete a user's account and data
  // - Implement a functionality to check if a user is a member of the band/junior band or just subscribed to alerts, etc.
  // - Use this? https://developers.google.com/identity/gsi/web/guides/display-button
  // - Create login and logout endpoints to use with firebase?
  // - Give click bait button for subscribing to practice cancellation notifications and then make them fill in member form to sign up

const SignIn: React.FC = () => {
  const { user, authSignOut } = useAuth();
  const [email, setEmail] = useState<string>('');
  const [error, setError] = useState<string>('');

  const userIsMember = false;

  /// Moved from AuthContext
  // export enum AuthProviderOption {
  //   Google = "google.com",
  //   Microsoft = "microsoft.com",
  //   Facebook = "facebook.com",
  //   Yahoo = "yahoo.com"
  // }

  // const signInWithProviderPopup = async (selectedProvider: AuthProviderOption) => {
  //   signInWithPopup(firebaseAuth, new OAuthProvider(selectedProvider))
  //   .then((result) => {
  //     console.log("Successfully signed in with provider:", result);
  //     console.log("Additional user info:", getAdditionalUserInfo(result));
  //   })
  //   .catch((error) => {
  //     switch (error.code) {
  //       case "auth/account-exists-with-different-credential":
  //         linkAccountsWithPopups(error?.customData?._tokenResponse?.verifiedProvider[0] as AuthProviderOption, selectedProvider);
  //         break;
  //       case "auth/popup-closed-by-user":
  //         console.log("Auth popup closed by user");
  //         break;
  //       case "auth/cancelled-popup-request":
  //         console.log("Auth popup request cancelled");
  //         break;
  //       default:
  //         console.error("Error signing in:", error);
  //     }
  //   });
  // };

  // const linkAccountsWithPopups = async (existingAccountAuthProvider: AuthProviderOption, selectedProvider: AuthProviderOption) => {
  //   if (!existingAccountAuthProvider) {
  //     console.error("Error signing in: Account exists with another provider, failed to link accounts No existing account provider found");
  //     return;
  //   }

  //   // Sign in with the existing account via the original provider
  //   // TODO warn users about popups getting blocked
  //   signInWithPopup(firebaseAuth, new OAuthProvider(existingAccountAuthProvider))
  //   .then(async () => {
  //     if (!firebaseAuth.currentUser) 
  //       throw new Error("User is not signed in with the original auth provider");

  //     // After successful sign-in, link with the pending credential
  //     return await linkWithPopup(firebaseAuth.currentUser, new OAuthProvider(selectedProvider));
  //   })
  //   .catch((linkError) => {
  //     console.error("Error linking to existing account:", linkError);
  //   });
  // }

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
        {error && <div className="sign-in-error" role="alert" style={{ color: "red" }}>{error}</div>}
        <div className="sign-in-methods-container">
          <EmailLinkSignInForm setError={setError}/>
          {/*<EmailSignIn setError={setError}/>
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
          </div>*/}
        </div>
      </div>
    </>
  );

  return accountContent;
};

export default SignIn;
