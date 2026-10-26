import { readStorage, removeStorage } from '../../utils/storage';
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { firebaseAuth } from '../../utils/Firebase';
import { 
  getAuth, 
  User, 
  getAdditionalUserInfo, 
  signInWithEmailLink, 
  isSignInWithEmailLink, 
  signOut, 
  onAuthStateChanged
} from 'firebase/auth';

const auth = getAuth();

if (isSignInWithEmailLink(auth, window.location.href)) {
  // Additional state parameters can also be passed via URL.
  // This can be used to continue the user's intended action before triggering
    // the sign-in operation.
  // Get the email if available. This should be available if the user completes
    // the flow on the same device where they started it.
  let email = readStorage(() => window.localStorage, 'signInEmail');

  if (!email) {
    // User opened the link on a different device. To prevent session fixation
    // attacks, ask the user to provide the associated email again. For example:
    email = window.prompt('Please provide your email for confirmation');
  }

  if (email) {
    // The client SDK will parse the code from the link for you.
    signInWithEmailLink(auth, email, window.location.href)
      .then((result) => {
        // Clear email from storage.
        removeStorage(() => window.localStorage, 'signInEmail');
        // You can access the new user by importing getAdditionalUserInfo
          // and calling it with result:
          // getAdditionalUserInfo(result)
        // You can access the user's profile via:
         // getAdditionalUserInfo(result)?.profile
        // You can check if the user is new or existing:
         // getAdditionalUserInfo(result)?.isNewUser
      })
      .catch((error) => {
        // Some error occurred, you can inspect the code: error.code
        // Common errors could be invalid email and invalid or expired OTPs.
        console.error("Error signing in with email link:", error);
      });
  } else {
    console.error("Error signing in with email link: No email provided");
  }
}

const authSignOut = async () => {
  return await signOut(getAuth())
  .catch((error) => {
    console.error("Error signing out:", error);
  });
};

interface AuthContextType {
  user: User | null;
  authSignOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  authSignOut: async () => {}
});

interface AuthProviderProps {
  children: ReactNode;
}

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, setUser);
    return unsubscribe;
  }, []);

  return <AuthContext.Provider value={{ user, authSignOut }}>{children}</AuthContext.Provider>;
};
