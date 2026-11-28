import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  buildApiUrl,
  getConfiguredApiRoutes,
  getServerIdHeaders,
  getStoredExternalServerId,
  isCapacitorNativeRuntime,
  normalizeServerBaseUrl,
  safeParseJsonBody,
} from '../utils/networkAndServer.ts';
import {
  auth,
  parseFirebaseAuthError,
  signInWithGoogleCredential,
  signInWithGooglePopup,
  signOutFirebase,
  testFirestoreConnection,
  type ParsedFirebaseAuthError,
} from './firebaseApp.ts';

interface FirebaseContextValue {
  user: User | null;
  authReady: boolean;
  cloudReachable: boolean;
  authBusy: boolean;
  authError: string | null;
  authErrorInfo: ParsedFirebaseAuthError | null;
  signInWithGoogle: (bridgeServerUrl?: string, bridgeServerId?: string) => Promise<User | null>;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
}

const FirebaseContext = createContext<FirebaseContextValue>({
  user: null,
  authReady: false,
  cloudReachable: true,
  authBusy: false,
  authError: null,
  authErrorInfo: null,
  signInWithGoogle: async () => null,
  signOut: async () => undefined,
  clearAuthError: () => undefined,
});

async function attemptHostedMobileAuthBridge(
  serverBaseUrl: string,
  serverId: string
): Promise<User | null> {
  const routes = getConfiguredApiRoutes();
  const startUrl = buildApiUrl(routes.mobileAuthStart, serverBaseUrl);
  const pollUrl = buildApiUrl(routes.mobileAuthPoll, serverBaseUrl);
  if (!startUrl || !pollUrl) return null;

  const startRes = await fetch(startUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getServerIdHeaders(serverId),
    },
    body: JSON.stringify({}),
  });
  const startParsed = await safeParseJsonBody<{ sessionId?: string; writeSecret?: string }>(startRes);
  if (!startParsed.ok || !startParsed.data?.sessionId || !startParsed.data?.writeSecret) {
    return null;
  }

  const { sessionId, writeSecret } = startParsed.data;
  const bridgePageUrl = `${serverBaseUrl}/?mobileAuthSession=${encodeURIComponent(
    sessionId
  )}&s=${encodeURIComponent(writeSecret)}&sid=${encodeURIComponent(serverId)}`;

  // Open in system Chrome browser on Capacitor Android (intercepted by MainActivity or target _blank)
  const popup = window.open(bridgePageUrl, '_blank', 'noopener');
  if (!popup) {
    const anchor = document.createElement('a');
    anchor.href = bridgePageUrl;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 1500));
    try {
      const pollRes = await fetch(pollUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getServerIdHeaders(serverId),
        },
        body: JSON.stringify({ sessionId, writeSecret }),
      });
      if (pollRes.status === 404) {
        return null;
      }
      const pollParsed = await safeParseJsonBody<{
        status?: 'pending' | 'completed';
        idToken?: string;
        accessToken?: string;
      }>(pollRes);
      if (pollParsed.ok && pollParsed.data?.status === 'completed') {
        const { idToken, accessToken } = pollParsed.data;
        if (idToken || accessToken) {
          return await signInWithGoogleCredential(idToken ?? null, accessToken ?? null);
        }
        return null;
      }
    } catch {
      // Transient network hiccup while browser is active; continue polling until deadline
    }
  }
  return null;
}

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [cloudReachable, setCloudReachable] = useState<boolean>(true);
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authErrorInfo, setAuthErrorInfo] = useState<ParsedFirebaseAuthError | null>(null);

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

  const signInWithGoogle = useCallback(
    async (bridgeServerUrl?: string, bridgeServerId?: string): Promise<User | null> => {
      setAuthBusy(true);
      setAuthError(null);
      setAuthErrorInfo(null);
      try {
        const normalizedBridgeBase = normalizeServerBaseUrl(bridgeServerUrl ?? '');
        const resolvedSid = (bridgeServerId ?? getStoredExternalServerId()).trim() || 'cvsu-uci-core-v2';

        if (isCapacitorNativeRuntime() && normalizedBridgeBase) {
          try {
            const bridgedUser = await attemptHostedMobileAuthBridge(normalizedBridgeBase, resolvedSid);
            if (bridgedUser) {
              return bridgedUser;
            }
          } catch {
            // Fall through to popup attempt if hosted bridge server is unreachable
          }
        }

        const signedIn = await signInWithGooglePopup();
        return signedIn;
      } catch (err) {
        const parsed = parseFirebaseAuthError(err);
        setAuthError(parsed.message);
        setAuthErrorInfo(parsed);
        return null;
      } finally {
        setAuthBusy(false);
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    setAuthBusy(true);
    setAuthError(null);
    setAuthErrorInfo(null);
    try {
      await signOutFirebase();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign out failed.');
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
    setAuthErrorInfo(null);
  }, []);

  return (
    <FirebaseContext.Provider
      value={{
        user,
        authReady,
        cloudReachable,
        authBusy,
        authError,
        authErrorInfo,
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
