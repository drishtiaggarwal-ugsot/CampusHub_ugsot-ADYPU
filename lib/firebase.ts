import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getFirestore, type Firestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyA1Vem3KMiMuXssCXZQBA2xNUUAc5AJ2VQ',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'campus-hub26.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'campus-hub26',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'campus-hub26.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '699457039836',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:699457039836:web:c3c7f007440795f0da7319',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || 'G-J18MYBPCVE',
};

let app: FirebaseApp;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);

  if (typeof window !== 'undefined') {
    try {
      getAnalytics(app);
    } catch (e) {
      console.warn('Analytics initialization failed:', e);
    }
  }
} else {
  app = getApps()[0];
}

export const FIREBASE_DATABASE_ID =
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || 'default';

const db: Firestore =
  FIREBASE_DATABASE_ID === '(default)'
    ? getFirestore(app)
    : getFirestore(app, FIREBASE_DATABASE_ID);

export { app, db };

