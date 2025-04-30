import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { firebaseAuth } from '../../utils/Firebase';
import { User, getAuth, OAuthProvider, signInWithPopup, linkWithPopup, onAuthStateChanged, getAdditionalUserInfo, signOut } from 'firebase/auth';

export enum AuthProviderOption {
  Google = "google.com",
  Microsoft = "microsoft.com",
  Facebook = "facebook.com",
  Yahoo = "yahoo.com"
}

const signInWithProviderPopup = async (selectedProvider: AuthProviderOption) => {
  signInWithPopup(firebaseAuth, new OAuthProvider(selectedProvider))
  .then((result) => {
    console.log("Successfully signed in with provider:", result);
    console.log("Additional user info:", getAdditionalUserInfo(result));
  })
  .catch((error) => {
    switch (error.code) {
      case "auth/account-exists-with-different-credential":
        linkAccountsWithPopups(error?.customData?._tokenResponse?.verifiedProvider[0] as AuthProviderOption, selectedProvider);
        break;
      case "auth/popup-closed-by-user":
        console.log("Auth popup closed by user");
        break;
      case "auth/cancelled-popup-request":
        console.log("Auth popup request cancelled");
        break;
      default:
        console.error("Error signing in:", error);
    }
  });
};

const linkAccountsWithPopups = async (existingAccountAuthProvider: AuthProviderOption, selectedProvider: AuthProviderOption) => {
  if (!existingAccountAuthProvider) {
    console.error("Error signing in: Account exists with another provider, failed to link accounts No existing account provider found");
    return;
  }

  // Sign in with the existing account via the original provider
  // TODO warn users about popups getting blocked
  signInWithPopup(firebaseAuth, new OAuthProvider(existingAccountAuthProvider))
  .then(async () => {
    if (!firebaseAuth.currentUser) 
      throw new Error("User is not signed in with the original auth provider");

    // After successful sign-in, link with the pending credential
    return await linkWithPopup(firebaseAuth.currentUser, new OAuthProvider(selectedProvider));
  })
  .catch((linkError) => {
    console.error("Error linking to existing account:", linkError);
  });
}

const authSignOut = async () => {
  return await signOut(getAuth())
  .catch((error) => {
    console.error("Error signing out:", error);
  });
};

interface AuthContextType {
  user: User | null;
  signInWithProviderPopup: (providerSelection: AuthProviderOption) => Promise<void>;
  authSignOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  signInWithProviderPopup: async (providerSelection: AuthProviderOption) => {},
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

  return <AuthContext.Provider value={{ user, signInWithProviderPopup, authSignOut }}>{children}</AuthContext.Provider>;
};
