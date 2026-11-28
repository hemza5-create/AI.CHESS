import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  auth,
  signInWithGooglePopup,
  signOutFirebase,
  testFirestoreConnection,
} from './firebaseApp.ts';

interface FirebaseContextValue {
  user: User | null;
  authReady: boolean;
  cloudReachable: boolean;
  authBusy: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<User | null>;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
}

const FirebaseContext = createContext<FirebaseContextValue>({
  user: null,
  authReady: false,
  cloudReachable: true,
  authBusy: false,
  authError: null,
  signInWithGoogle: async () => null,
  signOut: async () => undefined,
  clearAuthError: () => undefined,
});

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [cloudReachable, setCloudReachable] = useState<boolean>(true);
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    void testFirestoreConnection().then((ok) => {
      setCloudReachable(ok);
    });

    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<User | null> => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const signedIn = await signInWithGooglePopup();
      return signedIn;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      setAuthError(msg);
      return null;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signOutFirebase();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign out failed.');
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <FirebaseContext.Provider
      value={{
        user,
        authReady,
        cloudReachable,
        authBusy,
        authError,
        signInWithGoogle,
        signOut,
        clearAuthError,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export function useFirebase(): FirebaseContextValue {
  return useContext(FirebaseContext);
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class FirebaseErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected cloud state error.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0B101B] text-white flex items-center justify-center p-6">
          <div className="max-w-lg w-full p-6 rounded-xl border border-rose-400/50 bg-slate-900/90 space-y-3">
            <h2 className="text-lg font-bold text-rose-300">Cloud Connection Recovery</h2>
            <p className="text-xs text-slate-300 break-words font-mono">{this.state.message}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="px-4 py-2 text-sm font-bold bg-cyan-400 text-slate-950 rounded-lg"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
