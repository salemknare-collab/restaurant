import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, setLogLevel } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Suppress non-critical warnings from Firestore (like transient connection issues)
setLogLevel('error');

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Explicitly set persistence to browserLocalPersistence to avoid indexedDB network-request-failed timeout issues
setPersistence(auth, browserLocalPersistence).catch(() => {
  // Graceful fallback
});

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
}, firebaseConfig.firestoreDatabaseId);

// Secondary app for creating users without logging out the current user
export const secondaryApp = initializeApp(firebaseConfig, 'Secondary');
export const secondaryAuth = getAuth(secondaryApp);
