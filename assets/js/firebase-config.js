// Firebase config loader for static pages.
// Keep real values in assets/js/firebase-config.local.js (ignored by git).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let firebaseConfig = null;

try {
    const localConfigModule = await import("./firebase-config.local.js");
    firebaseConfig = localConfigModule.firebaseConfig;
} catch (error) {
    console.warn("Firebase local config not found. Create assets/js/firebase-config.local.js from the example file.");
}

const app = firebaseConfig ? initializeApp(firebaseConfig) : null;
const db = app ? getFirestore(app) : null;
const auth = app ? getAuth(app) : null;
const provider = app ? new GoogleAuthProvider() : null;

export { db, auth, provider };