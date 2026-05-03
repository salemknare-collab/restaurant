import { db, auth } from '../firebase';
import { collection, doc, getDocs, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy } from 'firebase/firestore';

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
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function generateInternalEmail(username: string): string {
  if (!username) return '';
  
  const trimmed = username.trim().toLowerCase();
  
  // Try the legacy exact match (what users who successfully logged in before had to type).
  // If they typed something that was valid all along (e.g., 'salem123')
  if (/^[a-z0-9_.-]+$/.test(trimmed)) {
    return `${trimmed}@restaurant.internal`;
  }
  
  // If it has spaces or arabic, we encode it to make it a globally valid ASCII email
  const safePrefix = encodeURIComponent(trimmed).replace(/%/g, '_x_').toLowerCase();
  return `${safePrefix}@restaurant.internal`;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  const errorString = JSON.stringify(errInfo);
  console.error('Firestore Error: ', errorString);
  
  // Throw asynchronously to avoid crashing Firestore SDK's internal event loop
  setTimeout(() => {
    throw new Error(errorString);
  }, 0);
}
