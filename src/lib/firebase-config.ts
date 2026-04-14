import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "API_KEY_PLACEHOLDER",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "FIREBASE_AUTH_DOMAIN_PLACEHOLDER",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "FIREBASE_DATABASE_URL_PLACEHOLDER",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "FIREBASE_PROJECT_ID_PLACEHOLDER",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "FIREBASE_STORAGE_BUCKET_PLACEHOLDER",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "FIREBASE_MESSAGING_SENDER_ID_PLACEHOLDER",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "FIREBASE_APP_ID_PLACEHOLDER",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "FIREBASE_MEASUREMENT_ID_PLACEHOLDER"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const initAuth = async (customToken?: string) => {
  if (customToken) {
    return signInWithCustomToken(auth, customToken);
  } else {
    return signInAnonymously(auth);
  }
};

