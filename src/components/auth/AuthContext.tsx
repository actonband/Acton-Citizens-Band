import { readStorage, removeStorage } from "../../utils/storage";
import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { firebaseAuth } from "../../utils/Firebase";
import {
  getAuth,
  User,
  signInWithEmailLink,
  isSignInWithEmailLink,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

const auth = getAuth();

if (typeof window !== "undefined" && isSignInWithEmailLink(auth, window.location.href)) {
  let email = readStorage(() => window.localStorage, "signInEmail");

  if (!email) {
    email = window.prompt("Please provide your email for confirmation");
  }

  if (email) {
    signInWithEmailLink(auth, email, window.location.href)
      .then(() => {
        removeStorage(() => window.localStorage, "signInEmail");
      })
      .catch((error) => {
        console.error("Error signing in with email link:", error);
      });
  } else {
    console.error("Error signing in with email link: No email provided");
  }
}

const authSignOut = async () => {
  return await signOut(getAuth()).catch((error) => {
    console.error("Error signing out:", error);
  });
};

interface AuthContextType {
  user: User | null;
  authSignOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  authSignOut: async () => {},
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
