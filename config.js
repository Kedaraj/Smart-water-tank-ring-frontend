/* AquaSmart — Config
   Firebase + Backend API settings */

// ── Backend API (Render) ────────────────────────────────────
const BACKEND_URL = (() => {
  if (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1') {
    return 'http://localhost:4000';
  }
  return 'https://aqua-smart-api-z4e3.onrender.com';
})();

// ── Firebase Realtime Database ──────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAgloMGXGKaVQmg76crcuV4JN54e9TN4fw",
  authDomain:        "aquasmart-70.firebaseapp.com",
  databaseURL:       "https://aquasmart-70-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "aquasmart-70",
  storageBucket:     "aquasmart-70.firebasestorage.app",
  messagingSenderId: "48236093653",
  appId:             "1:48236093653:web:fd0cca33f32046d2ec825c",
  measurementId:     "G-DTKHPGC70X"
};

// ✅ Firebase is now ENABLED — real-time live updates active
const USE_FIREBASE = true;
