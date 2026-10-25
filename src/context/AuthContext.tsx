import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';

export interface ActiveUserProfile {
  uid: string;
  email: string;
  displayName: string;
  authMethod: 'google_sso' | 'enterprise_credentials' | 'default_session';
}

interface AuthContextValue {
  user: ActiveUserProfile | null;
  idToken: string | null;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  loginWithEnterpriseCredentials: (params: {
    email: string;
    password: string;
    displayName?: string;
  }) => Promise<boolean>;
  logout: () => Promise<void>;
  getValidToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  idToken: null,
  loading: true,
  authError: null,
  signInWithGoogle: async () => {},
  loginWithEnterpriseCredentials: async () => false,
  logout: async () => {},
  getValidToken: async () => null,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<ActiveUserProfile | null>({
    uid: 'hzl-commercial-desk',
    email: 'commercial.desk@hzlindia.com',
    displayName: 'HZL Commercial Desk',
    authMethod: 'default_session',
  });
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          setIdToken(token);
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email || 'user@hzlindia.com',
              displayName:
                data.name ||
                firebaseUser.displayName ||
                (firebaseUser.email || 'user').split('@')[0],
              authMethod: 'google_sso',
            });
          }
        } catch (err) {
          console.error('Error retrieving Firebase ID token:', err);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      const credential = await signInWithPopup(auth, googleAuthProvider);
      const token = await credential.user.getIdToken();
      setIdToken(token);
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.ok ? await res.json() : {};
      setUser({
        uid: credential.user.uid,
        email: credential.user.email || 'user@hzlindia.com',
        displayName:
          data.name ||
          credential.user.displayName ||
          (credential.user.email || 'user').split('@')[0],
        authMethod: 'google_sso',
      });
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      setAuthError(err.message || 'Sign-in popup closed or blocked.');
    }
  };

  const loginWithEnterpriseCredentials = async (params: {
    email: string;
    password: string;
    displayName?: string;
  }) => {
    setAuthError(null);
    try {
      const res = await fetch('/api/auth/enterprise-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Enterprise credential authentication failed.');
      }
      setIdToken(data.sessionToken);
      setUser({
        uid: data.user.uid,
        email: data.user.email,
        displayName: data.user.displayName || data.user.email.split('@')[0],
        authMethod: 'enterprise_credentials',
      });
      return true;
    } catch (err: any) {
      setAuthError(err.message || 'Login failed.');
      return false;
    }
  };

  const logout = async () => {
    if (auth.currentUser) {
      await signOut(auth);
    }
    setIdToken(null);
    setUser(null);
  };

  const getValidToken = async () => {
    if (idToken && idToken.startsWith('hzl_sess.')) {
      return idToken;
    }
    if (auth.currentUser) {
      try {
        const freshToken = await auth.currentUser.getIdToken();
        setIdToken(freshToken);
        return freshToken;
      } catch {
        return idToken;
      }
    }
    return idToken;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        idToken,
        loading,
        authError,
        signInWithGoogle,
        loginWithEnterpriseCredentials,
        logout,
        getValidToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
