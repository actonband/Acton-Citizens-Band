import React, { useState } from 'react';

import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile,
  fetchSignInMethodsForEmail, 
  sendPasswordResetEmail 
} from 'firebase/auth';

// https://firebase.google.com/docs/reference/node/firebase.auth.Auth

interface EmailSignInProps {
  setError: React.Dispatch<React.SetStateAction<string>>;
}

export const EmailSignIn: React.FC<EmailSignInProps> = ({ setError }) => {
  const auth = getAuth();
  const [step, setStep] = useState<number>(1);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmationPassword, setConfirmationPassword] = useState<string>('');
  const [displayName, setDisplayName] = useState('');

  const handleStepChange = (nextStep: number, e?: React.FormEvent) => {
    setError('');
    
    // Perform validation before proceeding to next step
    if (e && step < nextStep) {
      e.preventDefault();

      const form = (e.currentTarget as HTMLElement).parentElement as HTMLFormElement;
      
      // Show validation errors
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
    }
  
    switch (nextStep) {
      case 5: // Validate passwords match
        if (password !== confirmationPassword) {
          setError('Passwords do not match.');
          return;
        }
        break;
    }
  
    setStep(nextStep); // Update the step
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const signInMethods = await fetchSignInMethodsForEmail(auth, email);
      console.log("handleSignInSubmit email: ", email);
      console.log("handleSignInSubmit signInMethods: ", signInMethods);

      let outerSignInResult = await signInWithEmailAndPassword(auth, email, password);
      
      // Handle successful sign in
      console.log("outerSignInResult: ", outerSignInResult);
    } catch (error: any) {
      handleError(error);
    }
  };

  const handleCreateAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const signInMethods = await fetchSignInMethodsForEmail(auth, email);
      console.log("handleSignInSubmit email: ", email);
      console.log("handleSignInSubmit signInMethods: ", signInMethods);

      let outerCreateUserResult = await createUserWithEmailAndPassword(auth, email, password);
      
      // Handle successful account creation
      console.log("outerCreateUserResult: ", outerCreateUserResult);
      console.log("outerCreateUserResult.user: ", outerCreateUserResult.user);

      let outerUpdateProfileResult = await updateProfile(outerCreateUserResult.user, { displayName: displayName });

      // Handle successful profile update
      console.log("outerUpdateProfileResult: ", outerUpdateProfileResult);
    } catch (error: any) {
      handleError(error);
    }
  };

  const handlePasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
    
      if (e) {
        e.preventDefault();
  
        const form = (e.currentTarget as HTMLElement).parentElement as HTMLFormElement;
        
        // Show validation errors
        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }
      }

      const signInMethods = await fetchSignInMethodsForEmail(auth, email);
      console.log("handleSignInSubmit email: ", email);
      console.log("handleSignInSubmit signInMethods: ", signInMethods);

      let outerPasswordResetResult = await sendPasswordResetEmail(auth, email);
      
      // Handle successful sending of password reset email
      console.log("outerPasswordResetResult Result: ", outerPasswordResetResult);
      setError('Password reset email sent to ' + email + '.');
    } catch (error: any) {
      handleError(error);
    }
  };

  const handleError = (error: any) => {
    switch (error.code) {
      case 'auth/email-already-in-use':
        setError('An account already exists for this email, try signing in with another provider.');
        break;
      case 'auth/weak-password':
        setError('Password should be at least 6 characters.');
        break;
      case 'auth/invalid-email':
        setError('Invalid email provided.');
        break;
      case 'auth/weak-password':
        setError('Password should be at least 6 characters.');
        break;
      case 'auth/operation-not-allowed':
        setError('An error occurred signing in with this email, try signing in with another provider.');
        break;
      case 'auth/user-disabled':
        setError('This account has been disabled, contact us for assistance.');
        break;
      case 'auth/user-not-found':
        setError('No account found for this email, try signing in with another provider.');
        break;
      case 'auth/wrong-password':
        setError('Incorrect password.');
        break;
      case 'auth/invalid-login-credentials':
        setError('Incorrect email or password.');
        break;

      // auth/invalid-email
      // Thrown if the email address is not valid.
      // auth/missing-android-pkg-name
      // An Android package name must be provided if the Android app is required to be installed.
      // auth/missing-continue-uri
      // A continue URL must be provided in the request.
      // auth/missing-ios-bundle-id
      // An iOS Bundle ID must be provided if an App Store ID is provided.
      // auth/invalid-continue-uri
      // The continue URL provided in the request is invalid.
      // auth/unauthorized-continue-uri
      // The domain of the continue URL is not whitelisted. Whitelist the domain in the Firebase console.
      // auth/user-not-found
      // Thrown if there is no user corresponding to the email address.

      default:
        setError(error.message);
        console.error("Unexpected error, message:", error.message);
        console.error("Unexpected error, code:", error.code);
        console.error("Unexpected error:", error);
        break;
    }
  }

  return (
    <div className="email-sign-in-container">
      {step === 1 && ( // Enter email to sign up or create account
        <form>
          <input
            className="input-text"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            required
          />
          <button className="button account-button" onClick={(e) => handleStepChange(2, e)}>
            <span className="button-icon"></span>
            <span className="button-text">Continue to Sign In</span>
          </button>
          <button className="button create-account-button" onClick={(e) => handleStepChange(3, e)}>
            <span className="button-icon"></span>
            <span className="button-text">Create Account</span>
          </button>
          <button className="button password-reset-button" onClick={handlePasswordResetSubmit}>
            <span className="button-icon"></span>
            <span className="button-text">Reset Password</span>
          </button>
        </form>
      )}
      {step === 2 && ( // Enter password to sign in
        <form onSubmit={handleSignInSubmit}>
          <input
            className="input-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
          />
          <button className="button account-button" type="submit">
            <span className="button-icon"></span>
            <span className="button-text">Sign In with Password</span>
          </button>
          <button className="button back-button unhidden" onClick={(e) => handleStepChange(1, e)}>
            <span className="button-icon"></span>
            <span className="button-text">Back</span>
          </button>
        </form>
      )}
      {step === 3 && ( // Confirm password to create account
        <form>
          <input
            className="input-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter a password"
            required
          />
          <button className="button create-account-button" onClick={(e) => handleStepChange(4, e)}>
            <span className="button-icon"></span>
            <span className="button-text">Set Password</span>
          </button>
          <button className="button back-button unhidden" onClick={(e) => handleStepChange(1, e)}>
            <span className="button-icon"></span>
            <span className="button-text">Back</span>
          </button>
        </form>
      )}
      {step === 4 && ( // Confirm password to create account
        <form>
          <input
            className="input-password"
            type="password"
            value={confirmationPassword}
            onChange={(e) => setConfirmationPassword(e.target.value)}
            placeholder="Retype your new password"
            required
          />
          <button className="button create-account-button" onClick={(e) => handleStepChange(5, e)}>
            <span className="button-icon"></span>
            <span className="button-text">Confirm Password</span>
          </button>
          <button className="button back-button unhidden" onClick={(e) => handleStepChange(3, e)}>
            <span className="button-icon"></span>
            <span className="button-text">Back</span>
          </button>
        </form>
      )}
      {step === 5 && ( // Enter display name to create account
        <form onSubmit={handleCreateAccountSubmit}>
          <input
            className="input-text"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter your name"
            required
          />
          <button className="button create-account-button" type="submit">
            <span className="button-icon"></span>
            <span className="button-text">Create Account</span>
          </button>
          <button className="button back-button unhidden" onClick={(e) => handleStepChange(4, e)}>
            <span className="button-icon"></span>
            <span className="button-text">Back</span>
          </button>
        </form>
      )}
    </div>
  );
};
