import { auth, provider } from "./firebase-config.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
    const authBtn = document.getElementById("auth-btn");
    const userDisplay = document.getElementById("user-display");

    if (!auth || !provider) {
        console.warn("Auth disabled: Firebase is not configured.");
        if (authBtn) {
            authBtn.disabled = true;
            authBtn.textContent = "Auth unavailable";
        }
        return;
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            if (authBtn) {
                authBtn.textContent = "Sign Out";
                authBtn.onclick = handleSignOut;
            }
            if (userDisplay) {
                userDisplay.textContent = `Hello, ${user.displayName}`;
                userDisplay.classList.remove("hidden");
            }
        } else {
            if (authBtn) {
                authBtn.textContent = "Sign In with Google";
                authBtn.onclick = handleSignIn;
            }
            if (userDisplay) {
                userDisplay.classList.add("hidden");
            }
        }
    });

    async function handleSignIn() {
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Auth Error:", error);
        }
    }

    async function handleSignOut() {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Sign Out Error:", error);
        }
    }
});