import { initializeApp } from 'firebase/app';
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
  type UserCredential,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db: Firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth: Auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const currentUser = auth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid ?? null,
      email: currentUser?.email ?? null,
      emailVerified: currentUser?.emailVerified ?? null,
      isAnonymous: currentUser?.isAnonymous ?? null,
      tenantId: currentUser?.tenantId ?? null,
      providerInfo:
        currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) ?? [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration (client is offline).');
      return false;
    }
    return true;
  }
}

export async function signInWithGooglePopupRaw(): Promise<UserCredential> {
  return signInWithPopup(auth, googleProvider);
}

export async function signInWithGoogleRedirect(): Promise<void> {
  await signInWithRedirect(auth, googleProvider);
}

export async function getGoogleRedirectResult(): Promise<UserCredential | null> {
  return getRedirectResult(auth);
}

export async function signInWithGooglePopup(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signInWithGoogleCredential(
  idToken?: string | null,
  accessToken?: string | null
): Promise<User> {
  const credential = GoogleAuthProvider.credential(idToken ?? null, accessToken ?? null);
  const result = await signInWithCredential(auth, credential);
  return result.user;
}

export function extractGoogleOAuthTokens(result: UserCredential): {
  idToken: string;
  accessToken: string;
} {
  const cred = GoogleAuthProvider.credentialFromResult(result);
  return {
    idToken: cred?.idToken ?? '',
    accessToken: cred?.accessToken ?? '',
  };
}

export interface ParsedFirebaseAuthError {
  code: string;
  message: string;
  hostname: string;
  consoleUrl: string;
}

export function parseFirebaseAuthError(err: unknown): ParsedFirebaseAuthError {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const rawCode =
    err && typeof err === 'object' && 'code' in err && typeof (err as { code?: unknown }).code === 'string'
      ? (err as { code: string }).code
      : '';
  const hostname =
    typeof window !== 'undefined' && window.location?.hostname
      ? window.location.hostname
      : 'localhost';
  const consoleUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`;

  const code =
    rawCode ||
    (rawMessage.includes('auth/unauthorized-domain')
      ? 'auth/unauthorized-domain'
      : rawMessage.includes('auth/popup-blocked')
      ? 'auth/popup-blocked'
      : rawMessage.includes('auth/popup-closed-by-user')
      ? 'auth/popup-closed-by-user'
      : rawMessage.includes('auth/network-request-failed')
      ? 'auth/network-request-failed'
      : rawMessage.includes('auth/cancelled-popup-request')
      ? 'auth/cancelled-popup-request'
      : rawMessage.includes('auth/operation-not-supported-in-this-environment')
      ? 'auth/operation-not-supported-in-this-environment'
      : rawMessage.includes('auth/mobile-bridge-unconfigured')
      ? 'auth/mobile-bridge-unconfigured'
      : rawMessage.includes('auth/mobile-bridge-unreachable')
      ? 'auth/mobile-bridge-unreachable'
      : 'auth/unknown');

  return {
    code,
    message: rawMessage || 'Google Sign-In failed.',
    hostname,
    consoleUrl,
  };
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIREBASE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;
export const FIREBASE_AUTH_DOMAIN = firebaseConfig.authDomain;
export const FIREBASE_OAUTH_CLIENT_ID = firebaseConfig.oAuthClientId;
