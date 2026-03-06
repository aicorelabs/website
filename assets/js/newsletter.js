import { db } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
    const newsletterForm = document.getElementById("newsletter-form");
    const newsletterBtn = document.getElementById("newsletter-btn");
    const newsletterMessage = document.getElementById("newsletter-message");

    if (!newsletterForm) {
        return;
    }

    if (!db) {
        console.warn("Newsletter disabled: Firebase is not configured.");
        if (newsletterBtn) {
            newsletterBtn.disabled = true;
            newsletterBtn.textContent = "Unavailable";
        }
        if (newsletterMessage) {
            newsletterMessage.textContent = "Newsletter is temporarily unavailable.";
            newsletterMessage.className = "mt-4 text-sm text-[#888] transition-all duration-300";
            newsletterMessage.classList.remove("hidden");
        }
        return;
    }

    newsletterForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const emailInput = newsletterForm.querySelector('input[type="email"]');
        const email = emailInput ? emailInput.value : "";

        if (!email) {
            return;
        }

        if (newsletterBtn) {
            newsletterBtn.disabled = true;
            newsletterBtn.textContent = "Subscribing...";
        }
        if (newsletterMessage) {
            newsletterMessage.classList.add("hidden");
        }

        try {
            await addDoc(collection(db, "newsletter"), {
                email,
                timestamp: serverTimestamp(),
                source: "static_website"
            });

            if (newsletterMessage) {
                newsletterMessage.textContent = "Thanks for subscribing! We'll be in touch.";
                newsletterMessage.className = "mt-4 text-sm text-primary transition-all duration-300";
                newsletterMessage.classList.remove("hidden");
            }
            if (emailInput) {
                emailInput.value = "";
            }
            if (newsletterBtn) {
                newsletterBtn.textContent = "Subscribed!";
            }
        } catch (error) {
            console.error("Newsletter error:", error);
            if (newsletterMessage) {
                newsletterMessage.textContent = "Something went wrong. Please try again later.";
                newsletterMessage.className = "mt-4 text-sm text-red-400 transition-all duration-300";
                newsletterMessage.classList.remove("hidden");
            }
            if (newsletterBtn) {
                newsletterBtn.disabled = false;
                newsletterBtn.textContent = "Subscribe";
            }
        }
    });
});