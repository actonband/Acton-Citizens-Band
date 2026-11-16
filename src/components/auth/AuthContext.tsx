import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { firebaseAuth } from "../../utils/firebase";
import { getAuth, User, signOut, onAuthStateChanged } from "firebase/auth";
import Analytics from "../Analytics";

const authSignOut = async () => {
  await signOut(getAuth());
};

interface AuthContextType {
  user: User | null;
  loading: boolean;
  authSignOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  authSignOut: async () => {},
});

interface AuthProviderProps {
  children: ReactNode;
}

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, authSignOut }}>
      <Analytics />
      {children}
    </AuthContext.Provider>
  );
};
