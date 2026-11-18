import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Critical requirement from skill: Pass firestoreDatabaseId if configured
export const db = (firebaseConfig as any).firestoreDatabaseId
  ? getFirestore(app, (firebaseConfig as any).firestoreDatabaseId)
  : getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
// Full Google Drive scope to link a fixed folder, create platform subfolders (NES/SNES/GBA), and upload ROM backups
googleProvider.addScope('https://www.googleapis.com/auth/drive');

// In-memory cache for OAuth access token (per workspace skill: never in localStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const getCachedAccessToken = (): string | null => cachedAccessToken;
export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

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
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let firestoreReachable = true;

export const isFirestoreReachable = (): boolean => firestoreReachable;

// Connection test on boot as required by skill
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    firestoreReachable = true;
  } catch (error: any) {
    const code = error?.code || '';
    const msg = error instanceof Error ? error.message : String(error);
    if (code === 'permission-denied') {
      // Security rules answered from server -> database is provisioned and online
      firestoreReachable = true;
      return;
    }
    if (code === 'not-found' || msg.includes('Database') || msg.includes('not found')) {
      firestoreReachable = false;
      console.warn('Firestore database not provisioned:', msg);
      return;
    }
    if (msg.includes('the client is offline') || code === 'unavailable') {
      console.warn('Firestore initial boot check offline/retrying:', msg);
    }
  }
}
testConnection();

export async function loginWithGoogle(): Promise<{ user: any; accessToken: string | null }> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      cachedAccessToken = credential.accessToken;
    }
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error("Google sign in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
}

export async function logoutUser() {
  try {
    await fbSignOut(auth);
    cachedAccessToken = null;
  } catch (error) {
    console.error("Logout error:", error);
    throw error;
  }
}

// Clear token on auth state change if logged out
auth.onAuthStateChanged((user) => {
  if (!user && !isSigningIn) {
    cachedAccessToken = null;
  }
});
