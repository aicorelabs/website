# NeuroChecklist Staging QA Report

*This document serves as a comprehensive bug-tracking and QA audit report generated for the NeuroChecklist staging environment. It details front-end visual issues, severe code-loop bugs, and heuristic testing results of the AI Chatbot.*

---

## Bug 1: PostHog Analytics Infinite Retry Loop (Critical)
**Severity:** High / Blocking  
**Location:** All Pages (Global Header/Footer script)

**Description:** 
When a user accesses the site with standard privacy extensions or ad-blockers (which natively block `eu.i.posthog.com` analytics traffic), the site's internal logic enters an infinite retry loop. The console is immediately flooded with hundreds of identical `ERR_BLOCKED_BY_CLIENT` errors. Without exponential backoff built into the analytics integration, this loop drains system memory and rapidly drains user battery life, eventually causing browser crashes on lower-end devices.

*(Please refer to the attached console error screenshot)*

---

## Bug 2: Massive Mobile Horizontal Overflow
**Severity:** High  
**Location:** Global Mobile Viewport (< 600px width)

**Description:** 
The website layout looks broken when viewed on a mobile phone. Something on the main page is too wide and pushes past the edge of the screen. This creates a giant, empty white space down the entire right side of the phone. Because of this, users are forced to scroll sideways (which shouldn't happen on mobile sites), and the top search bar gets cut off and pushed off-center.

*(Please refer to the attached mobile viewport screenshot)*

---

## Bug 3: Squished Text on AI Chatbot (Mobile)
**Severity:** Medium  
**Location:** Chatbot Screen on Mobile Phones

**Description:** 
When looking at the AI Chatbot on a small mobile screen, the text inside the preview cards (like the "McDonald 2017 criteria" text) doesn't shrink to fit properly. Because the box gets smaller but the text stays large, the words get completely squished against the edges of the box. This makes the text overlap with the borders and become very hard to read.

---

## Bug 4: Missing Dashboard UI Icons
**Severity:** Low / Visual Bug  
**Location:** Axon AI Chat Interface (Top Right Header)

**Description:** 
In the main AI chat window, there are three empty square border outlines natively rendered in the top-right corner. It appears the SVG icons meant to exist within these buttons (likely Share, Export, or Options) failed to load or were completely omitted from the shipped staging code.

*(Please refer to the attached Chatbot UI screenshot)*

---

## Bug 5: Critical Search Bar Hijack (Enter Key Error)
**Severity:** Critical / Blocking  
**Location:** Global Header Search Bar

**Description:** 
There is a major bug with the top search bar. When a user types a word (like "Alzheimer") and presses the 'Enter' key on their keyboard, the website doesn't actually search for it. Instead, pressing 'Enter' accidentally forces the "Upgrade/Pricing" pop-up window to appear on the screen. To make matters worse, the search dropdown menu gets stuck open on top of the pricing pop-up, creating a messy overlap. This effectively ruins the entire search experience for users.

*(Please refer to the attached pricing modal overlay screenshot)*

---

## Bug 6: Misaligned "Recently Published" Widget Layout
**Severity:** Medium / Visual Integrity  
**Location:** Main Homepage UI Grid

**Description:** 
The "Recently Published Checklists" box is either completely missing or pushed out of place on the homepage. While the "Popular Categories" section shows up perfectly where it belongs, the "Recently Published" section gets shoved off the screen into the empty background space. This happens because the code holding it together is broken, preventing it from lining up neatly next to the rest of the website's content.

---

---

## Bug 7: Complete Loss of Conversational Context (Amnesia)
**Severity:** High / Functional Impairment  
**Location:** Axon AI Chat Engine

**Description:** 
The chatbot has absolutely zero conversational "memory" or state retention. If a user provides context in one message (e.g., "I have a 45-year-old patient"), and then asks a follow-up question referencing that data (e.g., "What was the age?"), the AI behaves as though it has never seen the previous message, responding with: "I do not have that information." This renders the "conversational" aspect of the assistant functionally useless for sequential diagnostic queries, as users must restate all parameters in every single prompt.

---

## Bug 8: Unsanitized HTML Injection (XSS Vulnerability)
**Severity:** Critical / Security Risk  
**Location:** Axon AI User Input UI Bubbles

**Description:** 
The chat interface does not sanitize user inputs before rendering them on the screen. When a user inputs raw HTML tags (such as `<h1>Hello</h1>`), the chat window natively executes the code, rendering the text as an actual Header element rather than escaping it as strings. This exposes the web application to severe Cross-Site Scripting (XSS) attacks, where malicious actors could potentially inject script payloads into the chat session. This must be escaped immediately on the front-end string renderer.

---

## Bug 9: Broken "Read Article" Links
**Severity:** High  
**Location:** "Recent Articles" Section

**Description:** 
The "Read article" buttons inside the Recent Articles boxes don't work. Instead of taking you to the actual written article, clicking the buttons just automatically jumps you back to the middle of the homepage. This means the developers most likely forgot to connect the real page links to the buttons, leaving them as broken placeholders. 

---

## Chatbot Capability Summary
**Status:** MIXED (Guardrails Pass / Functionality Fails)  

**Validation (PASSED TESTS):** 
1. **Medical Persona Guardrails:** The Axon AI assistant possesses incredibly strong medical safety guardrails. During "Red Team" jailbreak attempts and fake-disease diagnostics, the AI successfully refused to break character or hallucinate medical data.
2. **Token Overflow UI Stability:** When bombarded with massive walls of irrelevant text, the chat UI safely caught the overflow and returned a polite fallback error without crashing the server or throwing a 500 error.
3. **Empty Submission Protection:** The UI correctly blocked blank submissions from firing to the backend.

**Validation (FAILED TESTS):** 
However, the chat interface completely fails basic usability and security checks, suffering from catastrophic conversation amnesia (Bug 7) and critical HTML injection vulnerabilities (Bug 8).
