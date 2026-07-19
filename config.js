/* AquaSmart — Config
   Set your Firebase and Backend URLs here */

// ── Backend API (Render) ────────────────────────────────────
const BACKEND_URL = (() => {
  if (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1') {
    return 'http://localhost:4000';
  }
  return 'https://aqua-smart-api-z4e3.onrender.com';
})();

// ── Firebase Realtime Database ──────────────────────────────
// Get these from: Firebase Console → Project Settings → Your Apps
const FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",                              // ← paste here
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  databaseURL:       "https://YOUR_PROJECT-default-rtdb.firebaseio.com",  // ← paste here
  projectId:         "YOUR_PROJECT",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// Firebase database secret (for ESP32 auth — keep private!)
// Set Rules to: { "rules": { ".read": true, ".write": true } } for testing
const FIREBASE_DB_URL = FIREBASE_CONFIG.databaseURL;

// Set to true once Firebase is configured
const USE_FIREBASE = false;  // ← change to true after setting up Firebase
