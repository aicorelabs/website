// Zeffron — Express server
// Serves the existing static HTML pages, the public/ asset bundle (shared CSS/JS),
// and the /api/* routes (form submissions, etc.).

require('dotenv').config(); // loads .env if present; no-op in production hosts that inject env vars directly

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { engine } = require('express-handlebars');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

// Honor X-Forwarded-* headers from Railway's edge proxy so req.ip / req.protocol
// reflect the real client, not the proxy. Required for accurate audit logging.
app.set('trust proxy', true);

// --- HTTP Basic Auth (factory) --------------------------------------------
// Returns a middleware that checks Basic Auth against the given user/pass.
// If either credential is empty, the gate is open (logged at boot) — keeps
// local dev frictionless while production should always have both set.
const timingSafeEq = (a, b) => {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
};

const makeBasicAuth = (user, pass, realm) => (req, res, next) => {
    if (!user || !pass) return next(); // auth disabled — see boot warning

    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
        const decoded = Buffer.from(encoded, 'base64').toString('utf8');
        const idx = decoded.indexOf(':'); // password may contain ':' so only split on first
        if (idx !== -1) {
            const u = decoded.slice(0, idx);
            const p = decoded.slice(idx + 1);
            if (timingSafeEq(u, user) && timingSafeEq(p, pass)) return next();
        }
    }

    res.setHeader('WWW-Authenticate', `Basic realm="${realm}", charset="UTF-8"`);
    if (req.path.startsWith('/api/') || req.accepts('json') === 'json') {
        return res.status(401).json({ ok: false, error: 'Authentication required' });
    }
    res.status(401).type('html').send('<h1>401 — Authentication required</h1>');
};

const JIRA_USER = process.env.JIRA_AUTH_USER || '';
const JIRA_PASS = process.env.JIRA_AUTH_PASS || '';
if (!JIRA_USER || !JIRA_PASS) {
    console.warn('[auth] JIRA_AUTH_USER / JIRA_AUTH_PASS not set — /jira is open. Set both to enable Basic Auth.');
}
const jiraBasicAuth = makeBasicAuth(JIRA_USER, JIRA_PASS, 'Zeffron Jira');

// --- Admin session auth (cookie-based, in-app login page) -----------------
// Admin uses ADMIN_AUTH_* if set; otherwise falls back to the Jira creds so
// existing deployments don't need a second secret. Either pair, both gates.
// The session itself is a self-contained signed cookie (HMAC-SHA256) — no
// server-side store, so it survives process restarts and scales horizontally
// without a Redis/session table. Cookie is HttpOnly + SameSite=Lax + Secure
// (in production), so it can't be read by client JS and isn't sent on
// cross-site POSTs.
const ADMIN_USER = process.env.ADMIN_AUTH_USER || JIRA_USER;
const ADMIN_PASS = process.env.ADMIN_AUTH_PASS || JIRA_PASS;
if (!ADMIN_USER || !ADMIN_PASS) {
    console.warn('[auth] ADMIN_AUTH_USER / ADMIN_AUTH_PASS (or JIRA fallback) not set — /admin is open.');
}

// SESSION_SECRET should be set in production. If not, derive a stable secret
// from the admin creds so existing sessions survive restarts in dev — NOT a
// security claim, just a pragmatic fallback.
const SESSION_SECRET = process.env.SESSION_SECRET
    || `${ADMIN_USER}|${ADMIN_PASS}|zeffron-admin-dev-fallback`;
if (!process.env.SESSION_SECRET) {
    console.warn('[auth] SESSION_SECRET not set — using a derived fallback. Set SESSION_SECRET in production.');
}
const SESSION_COOKIE = '__zsess';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

const signSession = (payload) => {
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('hex');
    return `${data}.${sig}`;
};

const verifySession = (token) => {
    if (!token || typeof token !== 'string') return null;
    const dot = token.lastIndexOf('.');
    if (dot < 0) return null;
    const data = token.slice(0, dot);
    const sig  = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('hex');
    let sigBuf, expBuf;
    try {
        sigBuf = Buffer.from(sig, 'hex');
        expBuf = Buffer.from(expected, 'hex');
    } catch { return null; }
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    try {
        const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
        if (!payload.exp || payload.exp < Date.now()) return null;
        return payload;
    } catch { return null; }
};

// Tiny cookie parser — avoids pulling in cookie-parser for a single use.
const parseCookies = (header) => {
    const out = {};
    if (!header || typeof header !== 'string') return out;
    for (const pair of header.split(';')) {
        const i = pair.indexOf('=');
        if (i < 0) continue;
        const k = pair.slice(0, i).trim();
        if (!k) continue;
        const v = pair.slice(i + 1).trim();
        try { out[k] = decodeURIComponent(v); }
        catch { out[k] = v; }
    }
    return out;
};

// Only allow same-origin relative paths for post-login redirects, so an
// attacker can't craft /backstage/login?next=https://evil.com.
const safeNext = (n) => {
    if (typeof n !== 'string' || !n) return '/backstage';
    if (!n.startsWith('/') || n.startsWith('//')) return '/backstage';
    return n;
};

const adminSessionAuth = (req, res, next) => {
    if (!ADMIN_USER || !ADMIN_PASS) return next(); // auth disabled — see boot warning

    const cookies = parseCookies(req.headers.cookie);
    const session = verifySession(cookies[SESSION_COOKIE]);
    if (session && session.u === ADMIN_USER) {
        req.adminUser = session.u;
        return next();
    }

    // API requests get JSON 401; HTML/anything-else gets redirected to the
    // login page. Note: req.accepts(['html','json']) returns the *best* match
    // — using accepts('json') alone misfires on browser requests because
    // their Accept header includes "*/*", which matches json.
    const wantsJson = req.path.startsWith('/api/') || req.accepts(['html', 'json']) === 'json';
    if (wantsJson) {
        return res.status(401).json({ ok: false, error: 'Authentication required' });
    }
    return res.redirect(302, `/backstage/login?next=${encodeURIComponent(req.originalUrl)}`);
};

// --- Handlebars view engine -------------------------------------------------
// All pages render through views/layouts/main.hbs by default. Partials
// (nav, footer, modal, etc.) live in views/partials/.
app.engine('hbs', engine({
    extname: '.hbs',
    defaultLayout: 'main',
    layoutsDir: path.join(ROOT, 'views/layouts'),
    partialsDir: path.join(ROOT, 'views/partials'),
    helpers: {
        eq: (a, b) => a === b,
        currentYear: () => new Date().getFullYear(),
        json: (v) => JSON.stringify(v),
        // Compact date/time used in the admin tables. Locale-stable so the
        // output doesn't shift between dev and prod machines.
        dt: (v) => {
            if (!v) return '';
            const d = v instanceof Date ? v : new Date(v);
            if (isNaN(d)) return '';
            return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
        },
    },
}));
app.set('view engine', 'hbs');
app.set('views', path.join(ROOT, 'views'));

// --- Body parsers -----------------------------------------------------------
// JSON + url-encoded for plain POSTs. Multipart/form-data is handled per-route
// by multer (so we don't add a global multipart parser).
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// --- Pretty page routes -----------------------------------------------------
// Registered BEFORE the static mounts so bare paths like `/blog` resolve to
// the listing page rather than getting 301'd by express.static's trailing-slash
// behaviour on a directory mount of the same name.

// Structured-data primitives reused across pages.
// The `logo` is a full ImageObject with dimensions (Google requires the
// logo to be reachable and tells site owners to declare it explicitly so
// it can be used in knowledge-panel cards).
const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Zeffron',
    legalName: 'Zeffron Systems',
    alternateName: 'Zeffron Systems',
    description: 'A UK product and AI studio building investor-ready AI products and MVPs for founders.',
    image: 'https://zeffron.ai/assets/iphone-16-pro-mockup-v2.jpg',
    logo: {
        '@type': 'ImageObject',
        url: 'https://zeffron.ai/assets/PNG/Logo%20-%20White@2x.png',
        contentUrl: 'https://zeffron.ai/assets/PNG/Logo%20-%20White@2x.png',
        width: 2782,
        height: 948,
        caption: 'Zeffron logo',
    },
    '@id': 'https://zeffron.ai',
    url: 'https://zeffron.ai',
    telephone: '+441215550123',
    email: 'hello@zeffron.ai',
    foundingLocation: { '@type': 'Place', name: 'London, United Kingdom' },
    address: { '@type': 'PostalAddress', addressLocality: 'London', addressRegion: 'England', addressCountry: 'GB' },
    areaServed: { '@type': 'Country', name: 'United Kingdom' },
    knowsAbout: [
        'Artificial intelligence',
        'AI product development',
        'Custom software engineering',
        'MVP development',
        'Fractional CTO services',
        'Product strategy',
    ],
    sameAs: [
        'https://www.linkedin.com/company/zeffron-ai/',
        'https://x.com/zeffron_ai',
        'https://www.instagram.com/zeffron_ai_',
    ],
};

// Home-page FAQs — keep in sync with the <details> blocks in views/home.hbs.
// Plain-text answers; Google's FAQPage rich-snippet rendering strips most HTML
// anyway, and the text version stays portable across consumers.
const homeFaqs = [
    {
        q: "I'm not technical at all. Can I still work with Zeffron?",
        a: "Yes — and frankly, most of our best engagements are with non-technical founders. You don't need to understand code, architecture, or infrastructure to work with us. What you need is a clear problem, a target user, and a willingness to make decisions fast. We handle everything else, explain technical trade-offs in plain language, and make sure you feel in control throughout the build.",
    },
    {
        q: 'How is Zeffron different from a freelancer or a larger agency?',
        a: "Freelancers are affordable but solo. They build what you ask for — and if you ask for the wrong thing, they build that too. Larger agencies are thorough but slow: months to kickoff, layers of project managers, and you still don't own the product thinking. Zeffron sits in neither category. We're a lean senior team that moves at startup speed. We'll tell you when a feature is a distraction, when a simpler architecture is the smarter bet, and when you're ready to raise before you think you are.",
    },
    {
        q: 'What if I need changes after the build days are up?',
        a: "The first week after launch is included in every sprint — if something isn't right, we fix it. Beyond that, most founders move onto a monthly retainer with us, where we act as their ongoing technical team. Some projects roll directly from a sprint into a Custom AI build or a fractional team arrangement. We'll always be transparent about what makes sense for your stage before recommending anything.",
    },
    {
        q: "My idea isn't fully formed yet. How developed does my concept need to be?",
        a: "Not very. What matters is whether the problem you're solving is real — not the polish of your brief. If you can describe who your user is, what they're struggling with today, and roughly what you imagine the solution looks like, that's enough to start. Our discovery process is specifically designed to turn loose thinking into a sharp, scoped product plan.",
    },
    {
        q: 'Do I own the code and the IP after the build?',
        a: "Completely and contractually. Everything we build for you belongs to you: the code, the design, the data architecture — all of it. We don't retain licensing rights, we don't keep back-end access after handover, and we don't use your product as a portfolio asset without your explicit permission.",
    },
    {
        q: 'Can you help me get investor-ready, not just build the product?',
        a: "Yes. Investor readiness is one of our four core services. We've seen too many founders walk into fundraising with a strong product and a weak story — or the other way around, a strong story and a product that falls apart under technical scrutiny. Our Investor & Pitch Readiness package includes a live product demo, technical documentation for due diligence, a co-developed pitch deck, and a GTM plan. We can join investor calls to answer technical questions directly if useful.",
    },
    {
        q: "I have something already built — but it's not production-ready. Can you help?",
        a: "Yes — and this is one of the most common situations we work with. A lot of founders today use AI-assisted tools to ship a first version fast, which is smart for validating an idea. But those builds weren't designed to scale, handle real user traffic, or pass a security review. We come in, audit what exists, identify where it breaks under pressure, fix the underlying architecture, and harden it for production — security, data handling, performance under load, and making the codebase something a future engineering team can actually work with. You keep the momentum. We make it solid enough to put in front of real users, enterprise clients, or investors without it becoming a liability.",
    },
];

const homeFaqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: homeFaqs.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
    })),
};

// Homepage SEO + structured data shared across all "homepage" routes
const homeLocals = {
    title: 'Zeffron — AI & MVP Development for Founders | UK',
    description: 'Zeffron builds investor-ready AI products and MVPs in 10 days. A UK product and AI studio for founders moving fast. Book a free discovery call today.',
    keywords: 'AI development UK, MVP development, custom AI agency, AI product studio, AI engineering UK, fractional CTO UK, investor-ready MVP',
    canonical: 'https://zeffron.ai/',
    activeNav: 'home',
    ogImage: 'https://zeffron.ai/assets/iphone-16-pro-mockup-v2.jpg',
    ogImageType: 'image/jpeg',
    ogImageWidth: 1200,
    ogImageHeight: 800,
    ogImageAlt: 'Zeffron — AI & MVP Development Studio for Founders',
    jsonLd: [
        organization,
        {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            '@id': 'https://zeffron.ai/#website',
            name: 'Zeffron',
            url: 'https://zeffron.ai/',
            publisher: { '@id': 'https://zeffron.ai' },
            inLanguage: 'en-GB',
        },
        {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            '@id': 'https://zeffron.ai/#webpage',
            url: 'https://zeffron.ai/',
            name: 'Zeffron — AI & MVP Development for Founders | UK',
            description: 'Zeffron builds investor-ready AI products and MVPs in 10 days. A UK product and AI studio for founders moving fast.',
            isPartOf: { '@id': 'https://zeffron.ai/#website' },
            about: { '@id': 'https://zeffron.ai' },
            primaryImageOfPage: {
                '@type': 'ImageObject',
                url: 'https://zeffron.ai/assets/iphone-16-pro-mockup-v2.jpg',
                width: 1200,
                height: 800,
            },
            inLanguage: 'en-GB',
        },
        {
            '@context': 'https://schema.org',
            '@type': 'ProfessionalService',
            name: 'Zeffron',
            url: 'https://zeffron.ai/',
            image: 'https://zeffron.ai/assets/iphone-16-pro-mockup-v2.jpg',
            logo: 'https://zeffron.ai/assets/PNG/Logo%20-%20White@2x.png',
            priceRange: '££££',
            address: { '@type': 'PostalAddress', addressLocality: 'London', addressRegion: 'England', addressCountry: 'GB' },
            areaServed: { '@type': 'Country', name: 'United Kingdom' },
            serviceType: ['Custom AI development', 'MVP development', 'Product engineering', 'Fractional CTO'],
            hasOfferCatalog: {
                '@type': 'OfferCatalog',
                name: 'Zeffron services',
                itemListElement: [
                    { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Rapid AI Product Development', description: 'Idea to investable product launch in 10 days.' } },
                    { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Custom AI Solutions', description: 'Bespoke AI integrations for existing tools and workflows.' } },
                    { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Technical Team on Demand', description: 'Fractional senior engineering team for scaling businesses.' } },
                    { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Investor & Pitch Readiness', description: 'Demo, technical docs, pitch deck, and GTM plan for fundraising.' } },
                ],
            },
        },
        homeFaqJsonLd,
    ],
};

app.get('/', (_req, res) => res.render('home', homeLocals));
app.get(['/work', '/services', '/faq', '/contact'], (_req, res) => res.render('home', homeLocals));

// --- Migrated pages (rendered through the shared layout) -------------------
app.get(['/career', '/careers'], (_req, res) => res.render('career', {
    title: 'Careers at Zeffron — AI & Software Engineering Jobs in the UK',
    description: 'Join Zeffron — a UK product and AI studio for founders. Roles in AI engineering, full-stack development, design, and product. Remote-first, output over hours.',
    keywords: 'AI engineering jobs UK, software engineering careers, full-stack developer jobs, AI startup jobs London, remote engineering roles UK, Zeffron careers',
    canonical: 'https://zeffron.ai/career',
    activeNav: 'careers',
    ogImageAlt: 'Careers at Zeffron — Build the unknown',
    jsonLd: [
        organization,
        {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: 'Careers at Zeffron',
            url: 'https://zeffron.ai/career',
            inLanguage: 'en-GB',
            isPartOf: { '@type': 'WebSite', '@id': 'https://zeffron.ai/' },
            about: { '@id': 'https://zeffron.ai' },
            description: 'Career opportunities at Zeffron — AI engineering, full-stack, design, and product roles.',
            breadcrumb: {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://zeffron.ai/' },
                    { '@type': 'ListItem', position: 2, name: 'Careers', item: 'https://zeffron.ai/career' },
                ],
            },
        },
    ],
}));

app.get('/privacy', (_req, res) => res.render('privacy', {
    title: 'Privacy Policy | Zeffron',
    description: 'How Zeffron Systems collects, uses, and protects personal data under UK GDPR and the Data Protection Act 2018.',
    canonical: 'https://zeffron.ai/privacy',
    activeNav: 'privacy',
    ogImageAlt: 'Zeffron — Privacy Policy',
    jsonLd: [
        organization,
        {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: 'Privacy Policy',
            url: 'https://zeffron.ai/privacy',
            inLanguage: 'en-GB',
            isPartOf: { '@type': 'WebSite', '@id': 'https://zeffron.ai/' },
            about: { '@id': 'https://zeffron.ai' },
            description: 'Zeffron Privacy Policy — what we collect, why, and the rights you have under UK GDPR.',
            breadcrumb: {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://zeffron.ai/' },
                    { '@type': 'ListItem', position: 2, name: 'Privacy', item: 'https://zeffron.ai/privacy' },
                ],
            },
        },
    ],
}));

app.get('/terms', (_req, res) => res.render('terms', {
    title: 'Terms of Service | Zeffron',
    description: 'Terms governing use of zeffron.ai and engagements with Zeffron Systems — a UK product and AI studio.',
    canonical: 'https://zeffron.ai/terms',
    activeNav: 'terms',
    ogImageAlt: 'Zeffron — Terms of Service',
    jsonLd: [
        organization,
        {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: 'Terms of Service',
            url: 'https://zeffron.ai/terms',
            inLanguage: 'en-GB',
            isPartOf: { '@type': 'WebSite', '@id': 'https://zeffron.ai/' },
            about: { '@id': 'https://zeffron.ai' },
            description: 'Terms of service for zeffron.ai and engagements with Zeffron Systems.',
            breadcrumb: {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://zeffron.ai/' },
                    { '@type': 'ListItem', position: 2, name: 'Terms', item: 'https://zeffron.ai/terms' },
                ],
            },
        },
    ],
}));

app.get('/playbook', (_req, res) => res.render('playbook', {
    title: "The Founder's AI Prompt Playbook — Free | Zeffron",
    description: '50+ AI prompts that take you from messy idea to MVP scope, user stories, and pitch deck in 30 minutes. The exact framework Zeffron uses to scope every sprint — free for non-technical founders.',
    keywords: 'AI prompts for founders, MVP scope template, non-technical founder playbook, founder AI guide, ChatGPT prompts startup, AI product scoping, Zeffron playbook',
    canonical: 'https://zeffron.ai/playbook',
    activeNav: 'playbook',
    ogImageAlt: "The Founder's AI Prompt Playbook — Zeffron",
    jsonLd: [
        organization,
        {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: "The Founder's AI Prompt Playbook",
            url: 'https://zeffron.ai/playbook',
            inLanguage: 'en-GB',
            isPartOf: { '@type': 'WebSite', '@id': 'https://zeffron.ai/' },
            about: { '@id': 'https://zeffron.ai' },
            description: '50+ AI prompts to go from idea to MVP scope, user stories, and pitch deck in 30 minutes.',
            breadcrumb: {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://zeffron.ai/' },
                    { '@type': 'ListItem', position: 2, name: 'Playbook', item: 'https://zeffron.ai/playbook' },
                ],
            },
        },
        {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [
                { '@type': 'Question', name: 'Is this actually free?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. No cost, no trial, no card. Drop your name and email and the playbook lands in your inbox.' } },
                { '@type': 'Question', name: 'Do I need to be technical to use it?', acceptedAnswer: { '@type': 'Answer', text: 'No. These prompts are designed for non-technical founders. If you can describe your idea in a few sentences, you can use every prompt in this guide.' } },
                { '@type': 'Question', name: 'How will I receive it?', acceptedAnswer: { '@type': 'Answer', text: "Instantly by email after you submit the form. Check your spam folder if it doesn't arrive within two minutes." } },
                { '@type': 'Question', name: "I've never used AI tools before. Can I still use this?", acceptedAnswer: { '@type': 'Answer', text: 'Yes. We recommend ChatGPT (the free version works), Claude, or Gemini. Each prompt tells you exactly what to paste in.' } },
                { '@type': 'Question', name: 'What is Zeffron?', acceptedAnswer: { '@type': 'Answer', text: "We're an AI & MVP studio. We help non-technical founders build working AI products in 10 days. If you finish the playbook and want to talk — there's a booking link inside." } },
                { '@type': 'Question', name: 'Will I be added to a mailing list?', acceptedAnswer: { '@type': 'Answer', text: "Yes — you'll receive a short email series with extra prompts and founder resources. Unsubscribe any time, one click." } },
            ],
        },
    ],
}));

app.get('/demos', (_req, res) => res.render('demos', {
    title: 'Live AI Demos — Supply Chain, CX & Ledger Tools | Zeffron',
    description: "Experience Zeffron's engineering capabilities firsthand. Interactive AI demos for supply chain forecasting, customer intent analysis, and automated ledger reconciliation — no login required.",
    keywords: 'AI demos UK, interactive AI prototypes, supply chain AI demo, customer intent AI, ledger reconciliation AI, Zeffron Live Lab, AI engineering showcase',
    canonical: 'https://zeffron.ai/demos',
    activeNav: 'demos',
    ogImageAlt: 'Zeffron Live Lab — Interactive AI demos',
    jsonLd: [
        organization,
        {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: 'Zeffron Live Lab — Interactive AI Demos',
            url: 'https://zeffron.ai/demos',
            inLanguage: 'en-GB',
            isPartOf: { '@type': 'WebSite', '@id': 'https://zeffron.ai/' },
            about: { '@id': 'https://zeffron.ai' },
            description: 'A live, interactive lab of Zeffron-built AI demos covering supply chain forecasting, customer intent classification, and ledger reconciliation.',
            breadcrumb: {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://zeffron.ai/' },
                    { '@type': 'ListItem', position: 2, name: 'Live Lab', item: 'https://zeffron.ai/demos' },
                ],
            },
            hasPart: [
                { '@type': 'CreativeWork', name: 'Supply Chain Intelligence', description: 'Predictive inventory management using historical sales and seasonal forecasting models.' },
                { '@type': 'CreativeWork', name: 'CX Intent Analysis', description: 'Real-time classification of customer tickets to automate routing and draft responses.' },
                { '@type': 'CreativeWork', name: 'Automated Ledger Reconciliation', description: 'AI-powered matching of bank transactions against internal ledger entries to detect anomalies.' },
            ],
        },
    ],
}));

// Blog posts — single source of truth for the listing AND per-post routes.
// `slug` drives both the URL (`/blog/<slug>`) and the view path (`blog/<slug>`).
// Listing-only fields: imageGradient, imageBg, imageFit, imageOpacity, stagger.
const blogPosts = [
    {
        slug: 'building-responsibly-with-ai-governance-playbook-2026',
        postTitle: 'Building Responsibly with AI in 2026: The Governance Playbook for Businesses That Want to Get This Right',
        seoTitle: 'Building Responsibly with AI in 2026: The Governance Playbook | Zeffron Blog',
        description: 'The prescription for the AI governance gap: a practical playbook for what building responsibly with AI looks like in practice — dependency hygiene, agent permissions, data minimisation, breach containment, and the four things the 12% share.',
        excerpt: 'The prescription for the AI governance gap. What building responsibly with AI actually looks like in practice — and what the organisations navigating this era successfully are doing differently from everyone else.',
        listingExcerpt: 'The prescription for the AI governance gap. What building responsibly with AI actually looks like in practice — and what the 12% successfully deploying agentic AI at scale all share.',
        keywords: 'AI governance, AI security, AI policy, dependency hygiene, agent permissions, data minimisation, breach containment, Zeffron AI',
        category: 'AI Governance',
        date: 'April 24, 2026',
        listingDate: 'Apr 24, 2026',
        datePublished: '2026-04-24',
        readTime: '8 min read',
        image: '/assets/blog-custom-ai.webp',
        imageAlt: 'Building Responsibly with AI in 2026',
        imageGradient: 'from-[#0145F2]/20 to-[#977DFF]/20',
        imageBg: 'bg-[#111]',
        imageFit: 'object-cover',
        imageOpacity: 'opacity-90',
    },
    {
        slug: 'ai-adoption-gap-threat-landscape-2026',
        postTitle: 'The AI Adoption Gap Nobody Wants to Talk About: Why the Threat Landscape Has Permanently Changed',
        seoTitle: 'The AI Adoption Gap Nobody Wants to Talk About | Zeffron Blog',
        description: "The gap between how fast AI is moving into businesses and how slowly oversight is following is not theoretical. It is the operational reality that made the most serious AI security incidents of 2026 possible — and it's widening.",
        excerpt: "Almost every organisation using AI today has a strategy for adopting it. Far fewer have a strategy for governing it. The gap is widening — and it's where attackers are building their campaigns.",
        listingExcerpt: 'Almost every organisation using AI today has a strategy for adopting it. Far fewer have a strategy for governing it. That gap is widening.',
        keywords: 'AI adoption gap, AI governance, AI security 2026, threat landscape, supply chain attacks, agentic AI risk, Zeffron AI',
        category: 'AI Governance',
        date: 'April 10, 2026',
        listingDate: 'Apr 10, 2026',
        datePublished: '2026-04-10',
        readTime: '8 min read',
        image: '/assets/blog-ai-adoption.webp',
        imageAlt: 'The AI Adoption Gap Nobody Wants to Talk About',
        imageGradient: 'from-[#0145F2]/20 to-[#977DFF]/20',
        imageBg: 'bg-[#111]',
        imageFit: 'object-cover',
        imageOpacity: 'opacity-90',
    },
    {
        slug: 'ai-stack-compromise-march-2026-security-incidents',
        postTitle: 'Why Nobody Is Talking About What Happens When the AI Stack Gets Compromised',
        seoTitle: 'When the AI Stack Gets Compromised: Two March 2026 Incidents | Zeffron Blog',
        description: 'Two security incidents in March 2026 revealed the infrastructure holding AI capability together is still fragile, still under attack, and built with too much implicit trust. Here is what they reveal and what to do about it.',
        excerpt: 'Two security incidents quietly reminded us that the infrastructure holding all of this AI capability together is still fragile, still under attack, and built with too much implicit trust. Neither incident made the front page. Both should have.',
        listingExcerpt: 'Two security incidents revealed the infrastructure holding AI capability together is still fragile, under attack, and built with too much implicit trust.',
        keywords: 'AI stack compromise, LiteLLM attack, CareCloud breach, supply chain attack, AI security incidents, Zeffron AI',
        category: 'Cybersecurity',
        date: 'April 3, 2026',
        listingDate: 'Apr 3, 2026',
        datePublished: '2026-04-03',
        readTime: '8 min read',
        image: '/assets/blog-ai-compromise.webp',
        imageAlt: 'AI Stack Compromise',
        imageGradient: 'from-[#0145F2]/20 to-[#977DFF]/20',
        imageBg: 'bg-[#111]',
        imageFit: 'object-cover',
        imageOpacity: 'opacity-90',
    },
    {
        slug: '5-signs-business-problem-ai-fit',
        postTitle: '5 Signs Your Business Problem Is a Perfect Fit for an AI Solution',
        seoTitle: '5 Signs Your Business Problem Is a Perfect Fit for AI | Zeffron Blog',
        description: "Before investing in AI, ask the right question. Here are 5 rigorous signs your business problem is a perfect candidate for an AI solution, and 3 warning signs it isn't.",
        excerpt: "Somewhere between the hype cycle and the horror stories, there is a more useful question most businesses never ask before investing in AI. Not \"What can AI do?\" But simply: \"Is my problem actually a good fit?\"",
        listingExcerpt: "Before investing in AI, ask the right question. Here are 5 rigorous signs your business problem is a perfect candidate for an AI solution, and 3 warning signs it isn't.",
        keywords: 'AI fit assessment, business problem AI, AI strategy UK, AI project failure, AI suitability framework, Zeffron AI',
        category: 'AI Strategy',
        date: 'March 25, 2026',
        datePublished: '2026-03-25',
        readTime: '10 min read',
        image: '/assets/blog-5-signs-hero.webp',
        imageAlt: '5 Signs your Business Problem is a perfect fit for an AI Solution',
        imageGradient: 'from-[#0145F2]/20 to-[#977DFF]/20',
        imageBg: 'bg-[#111]',
        imageFit: 'object-contain',
        imageOpacity: 'opacity-90',
    },
    {
        slug: 'let-your-users-build-for-you',
        postTitle: 'Let Your Users Build For You',
        seoTitle: 'Let Your Users Build For You | Zeffron',
        description: 'The shift from predefined features to generative systems is here. Discover why the future belongs to products that turn users into builders.',
        excerpt: 'The shift from predefined features to generative systems is here. Discover why the future belongs to products that turn users into builders.',
        listingExcerpt: 'The shift from predefined features to generative systems is here. Discover why the future belongs to products that turn users into builders.',
        keywords: 'generative software, composable products, user-built features, post-static software, AI product strategy, Zeffron',
        category: 'Product Strategy',
        date: 'March 18, 2026',
        listingDate: 'Mar 18, 2026',
        datePublished: '2026-03-18',
        readTime: '8 min read',
        image: '/assets/blog-let-users-build.webp',
        imageAlt: 'Let Your Users Build For You',
        imageGradient: 'from-[#0145F2]/20 to-[#977DFF]/20',
        imageFit: 'object-cover',
        imageOpacity: 'opacity-90',
        stagger: 1,
    },
    {
        slug: 'whatsapp-ai-agents-next-application-interface',
        postTitle: 'The Next Phase of Application Interfaces Might Be WhatsApp and AI Agents',
        seoTitle: 'WhatsApp + AI Agents: The Next Application Interface | Zeffron',
        description: 'Discover how AI-powered WhatsApp agents are bypassing traditional apps to transform the enterprise application interface in 2026.',
        excerpt: 'Software has been centred around screens for decades. We are now getting close to yet another turning point: conversation-driven execution is replacing interface-driven software.',
        listingExcerpt: 'Conversation-driven execution is replacing interface-driven software. The next phase might be WhatsApp powered by AI agents.',
        keywords: 'WhatsApp AI agents, conversational interfaces, AI customer service, agentic AI, messaging-first apps, WhatsApp Business Platform',
        category: 'Future of AI',
        date: 'March 6, 2026',
        listingDate: 'Mar 6, 2026',
        datePublished: '2026-03-06',
        readTime: '5 min read',
        image: '/assets/blog-whatsapp-agents.webp',
        imageAlt: 'WhatsApp AI Agents',
        imageGradient: 'from-[#0145F2]/20 to-[#90FFBD]/20',
        imageFit: 'object-cover',
        imageOpacity: 'opacity-80',
        stagger: 2,
    },
    {
        slug: 'custom-ai-solutions-2026',
        postTitle: 'How Custom AI Solutions Are Redefining Business Efficiency and Customer Experience in 2026',
        seoTitle: 'How Custom AI Is Redefining Business Efficiency in 2026 | Zeffron',
        description: 'Explore how custom agentic AI systems are redefining operational efficiency and transforming global business scaling in 2026.',
        excerpt: 'From making videos to retouching selfies and building websites with just a click, the full-scale dawn of AI is teaching the world that businesses and customers can control more.',
        listingExcerpt: "It's 2026, and AI is no longer just assistive—it's agentic. Discover how custom AI solutions are redefining business efficiency.",
        keywords: 'custom AI solutions, agentic AI 2026, AI customer experience, AI-first organizations, business automation AI, Zeffron AI engineering',
        category: 'Future of AI',
        date: 'February 13, 2026',
        listingDate: 'Feb 13, 2026',
        datePublished: '2026-02-13',
        readTime: '6 min read',
        image: '/assets/blog-custom-ai.webp',
        imageAlt: 'AI Future',
        imageGradient: 'from-[#0145F2]/20 to-[#977DFF]/20',
        imageFit: 'object-cover',
        imageOpacity: 'opacity-80',
        stagger: 3,
    },
];

const socialImageFor = (image) => ({
    '/assets/blog-ai-adoption.webp': '/assets/ai-adoption.jpeg',
    '/assets/blog-custom-ai.webp': '/assets/blog-custom-ai.jpeg',
    '/assets/blog-ai-compromise.webp': '/assets/blog-ai-compromise.jpeg',
    '/assets/blog-5-signs-hero.webp': '/assets/blog-5-signs-hero.jpg',
    '/assets/blog-let-users-build.webp': '/assets/let-users-build-doc-image.png',
    '/assets/blog-whatsapp-agents.webp': '/assets/whatsapp.png',
}[image] || image);

const imageTypeFor = (image) => {
    if (/\.png$/i.test(image)) return 'image/png';
    if (/\.webp$/i.test(image)) return 'image/webp';
    return 'image/jpeg';
};

// Listing-card view shape — projects postTitle/listingExcerpt/href into the
// generic fields the blog.hbs grid expects.
const listingCards = blogPosts.map((p) => ({
    ...p,
    href: `/blog/${p.slug}`,
    title: p.postTitle,
    excerpt: p.listingExcerpt || p.excerpt || p.description,
    fallbackImage: socialImageFor(p.image),
    date: p.listingDate || p.date,
}));

app.get('/blog', (_req, res) => res.render('blog', {
    title: 'AI & Software Development Blog | Zeffron',
    description: 'Insights, guides, and stories from Zeffron on AI development, software engineering, and building MVPs.',
    keywords: 'AI development blog, MVP blog, AI engineering UK, software engineering blog, Zeffron blog, founder insights',
    canonical: 'https://zeffron.ai/blog',
    activeNav: 'blog',
    ogImage: 'https://zeffron.ai/assets/blog-custom-ai.jpeg',
    ogImageType: 'image/jpeg',
    ogImageAlt: 'Zeffron — AI & Software Development Blog',
    posts: listingCards,
    jsonLd: [
        organization,
        {
            '@context': 'https://schema.org',
            '@type': 'Blog',
            name: 'Zeffron Blog',
            url: 'https://zeffron.ai/blog',
            inLanguage: 'en-GB',
            isPartOf: { '@type': 'WebSite', '@id': 'https://zeffron.ai/' },
            publisher: { '@id': 'https://zeffron.ai' },
            description: 'Insights on AI development, software engineering, and building MVPs.',
            blogPost: blogPosts.map((p) => ({
                '@type': 'BlogPosting',
                headline: p.postTitle,
                description: p.description,
                url: `https://zeffron.ai/blog/${p.slug}`,
                image: `https://zeffron.ai${socialImageFor(p.image)}`,
                datePublished: p.datePublished,
                author: { '@type': 'Organization', name: 'Zeffron' },
            })),
            breadcrumb: {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://zeffron.ai/' },
                    { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://zeffron.ai/blog' },
                ],
            },
        },
    ],
}));

// 301 redirects from previous slug structure to the keyword-rich slugs above.
// Preserves accumulated ranking signal and inbound links after the rename.
const slugRedirects = {
    'building-responsibly-with-ai': 'building-responsibly-with-ai-governance-playbook-2026',
    'ai-adoption': 'ai-adoption-gap-threat-landscape-2026',
    'ai-stack-compromise': 'ai-stack-compromise-march-2026-security-incidents',
    'whatsapp-ai-agents': 'whatsapp-ai-agents-next-application-interface',
};
for (const [oldSlug, newSlug] of Object.entries(slugRedirects)) {
    app.get(`/blog/${oldSlug}`, (_req, res) => res.redirect(301, `/blog/${newSlug}`));
}

// --- Per-post routes -------------------------------------------------------
// Each post renders views/blog/<slug>.hbs through the shared main layout with
// full SEO locals (title, description, canonical, OG/Twitter image + alt,
// JSON-LD BlogPosting + BreadcrumbList) so the chrome and metadata stay
// consistent with the rest of the site.
for (const post of blogPosts) {
    const canonical = `https://zeffron.ai/blog/${post.slug}`;
    const socialImage = socialImageFor(post.image);
    const absoluteImage = `https://zeffron.ai${socialImage}`;
    const ogImageType = imageTypeFor(socialImage);
    const shareTitleEncoded = encodeURIComponent(post.postTitle);

    app.get(`/blog/${post.slug}`, (_req, res) => res.render(`blog/${post.slug}`, {
        title: post.seoTitle,
        description: post.description,
        keywords: post.keywords,
        canonical,
        activeNav: 'blog',
        ogType: 'article',
        ogImage: absoluteImage,
        ogImageType,
        ogImageAlt: post.imageAlt,
        // Locals consumed by partials/blog-post-header.hbs
        postTitle: post.postTitle,
        excerpt: post.excerpt || post.listingExcerpt || post.description,
        category: post.category,
        date: post.date,
        readTime: post.readTime,
        shareTitleEncoded,
        jsonLd: [
            organization,
            {
                '@context': 'https://schema.org',
                '@type': 'BlogPosting',
                mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
                headline: post.postTitle,
                description: post.description,
                image: absoluteImage,
                url: canonical,
                inLanguage: 'en-GB',
                datePublished: post.datePublished,
                dateModified: post.datePublished,
                articleSection: post.category,
                keywords: post.keywords,
                author: {
                    '@type': 'Organization',
                    name: 'Zeffron',
                    url: 'https://zeffron.ai/',
                },
                publisher: {
                    '@type': 'Organization',
                    name: 'Zeffron',
                    logo: {
                        '@type': 'ImageObject',
                        url: 'https://zeffron.ai/assets/PNG/Logo%20-%20White@2x.png',
                    },
                },
                isPartOf: { '@type': 'Blog', '@id': 'https://zeffron.ai/blog' },
            },
            {
                '@context': 'https://schema.org',
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://zeffron.ai/' },
                    { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://zeffron.ai/blog' },
                    { '@type': 'ListItem', position: 3, name: post.postTitle, item: canonical },
                ],
            },
        ],
    }));
}

// --- Tool pages (rendered through a chrome-less `tool` layout) ------------
// Jira is now Postgres-backed (see /api/jira) and rendered via Handlebars.
app.get('/jira', jiraBasicAuth, (_req, res) => res.render('jira', {
    layout: 'tool',
    title: 'NeuroChecklists Board | Zeffron',
    description: 'Internal Postgres-backed project board for the NeuroChecklists engagement.',
}));

// --- Admin pages (cookie-session gated, chrome-less) ----------------------
// Internal-only views of form submissions. Auth: adminSessionAuth checks the
// signed __zsess cookie and redirects to /backstage/login on miss. Falls back to
// "auth disabled" only when ADMIN_AUTH_* (or JIRA fallback) is unset.
const adminDb = require('./db');

// Login page — shows the form, or redirects if already authenticated.
app.get('/backstage/login', (req, res) => {
    const next = safeNext(req.query.next);
    if (!ADMIN_USER || !ADMIN_PASS) return res.redirect(next); // auth disabled
    const cookies = parseCookies(req.headers.cookie);
    if (verifySession(cookies[SESSION_COOKIE])) return res.redirect(next);
    res.render('admin/login', {
        layout: 'tool',
        title: 'Admin login · Zeffron',
        description: 'Internal admin login.',
        next, error: null, username: '',
    });
});

// Login handler — sets the signed-cookie session on success; re-renders with
// an error on failure. Constant-time compare on both fields so timing doesn't
// reveal which one was wrong.
app.post('/backstage/login', (req, res) => {
    const next = safeNext(req.body && req.body.next);
    const username = (req.body && req.body.username) || '';
    const password = (req.body && req.body.password) || '';

    if (!ADMIN_USER || !ADMIN_PASS) return res.redirect(next); // auth disabled

    const userOk = typeof username === 'string' && timingSafeEq(username, ADMIN_USER);
    const passOk = typeof password === 'string' && timingSafeEq(password, ADMIN_PASS);
    if (userOk && passOk) {
        const now = Date.now();
        const token = signSession({ u: ADMIN_USER, iat: now, exp: now + SESSION_TTL_MS });
        res.cookie(SESSION_COOKIE, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: SESSION_TTL_MS,
            path: '/',
        });
        return res.redirect(next);
    }

    res.status(401).render('admin/login', {
        layout: 'tool',
        title: 'Admin login · Zeffron',
        description: 'Internal admin login.',
        next, error: 'Wrong username or password.',
        username: typeof username === 'string' ? username : '',
    });
});

// Logout — clears the session cookie and bounces back to the login page.
app.post('/backstage/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.redirect('/backstage/login');
});

app.get('/backstage', adminSessionAuth, async (_req, res) => {
    try {
        const counts = await adminDb.countSubmissions();
        res.render('admin/index', {
            layout: 'tool',
            title: 'Admin · Zeffron',
            description: 'Internal admin index.',
            counts,
        });
    } catch (err) {
        console.error('[admin] index render failed:', err.message);
        res.status(500).type('html').send(`<h1>Admin error</h1><pre>${err.message}</pre>`);
    }
});

app.get('/backstage/briefs', adminSessionAuth, async (_req, res) => {
    try {
        const briefs = await adminDb.listBriefs(500);
        res.render('admin/briefs', {
            layout: 'tool',
            title: 'Admin · Briefs · Zeffron',
            description: 'All brief-form submissions.',
            briefs,
            total: briefs.length,
        });
    } catch (err) {
        console.error('[admin] briefs render failed:', err.message);
        res.status(500).type('html').send(`<h1>Admin error</h1><pre>${err.message}</pre>`);
    }
});

app.get('/backstage/playbook', adminSessionAuth, async (_req, res) => {
    try {
        const leads = await adminDb.listPlaybookLeads(500);
        res.render('admin/playbook', {
            layout: 'tool',
            title: 'Admin · Playbook Leads · Zeffron',
            description: 'All playbook-form submissions.',
            leads,
            total: leads.length,
        });
    } catch (err) {
        console.error('[admin] playbook render failed:', err.message);
        res.status(500).type('html').send(`<h1>Admin error</h1><pre>${err.message}</pre>`);
    }
});

// n8n_org is still a one-off static page.
app.get('/n8n', (_req, res) => res.sendFile(path.join(ROOT, 'n8n_org.html')));

// --- Static asset mounts ----------------------------------------------------
//   /css/*, /js/*       → public/  (shared design system, scripts)
//   /assets/*           → assets/  (logo, images, icons — existing tree)
//   /                   → repo root (so robots.txt, sitemap.xml still resolve)
app.use(express.static(path.join(ROOT, 'public'), { maxAge: '1h', extensions: ['html'] }));
app.use('/assets', express.static(path.join(ROOT, 'assets'), { maxAge: '7d' }));

// --- API routes -------------------------------------------------------------
app.use('/api/brief', require('./api/brief'));
app.use('/api/playbook', require('./api/playbook'));
app.use('/api/jira',  jiraBasicAuth, require('./api/jira'));

// Health check (handy for deploy targets like Render / Fly / Railway)
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// --- Static fallback for every other .html / file at repo root --------------
app.use(express.static(ROOT, { extensions: ['html'], maxAge: '1h' }));

// --- 404 --------------------------------------------------------------------
app.use((_req, res) => res.status(404).render('home', homeLocals));

// Initialise the Postgres schema before accepting traffic. If pg init fails
// (or DATABASE_URL is missing), we still boot — the jira API will return
// 503s until the DB is configured, but every other route keeps working.
const db = require('./db');
(async () => {
    try {
        await db.init();
    } catch (err) {
        console.error('[db] init failed (non-fatal):', err.message);
    }
    const server = app.listen(PORT, () => {
        console.log(`Zeffron server running → http://localhost:${PORT}`);
    });

    // Graceful shutdown — Railway sends SIGTERM ~30s before terminating the
    // container on redeploy. Stop accepting new connections, finish in-flight
    // requests, drain the pg pool, then exit. Force-exit after 10s if anything
    // hangs (better than getting killed mid-flush).
    let shuttingDown = false;
    const shutdown = (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`[shutdown] received ${signal} — draining…`);
        const force = setTimeout(() => {
            console.warn('[shutdown] force-exit after 10s timeout');
            process.exit(1);
        }, 10_000).unref();
        server.close(async () => {
            await db.close();
            clearTimeout(force);
            console.log('[shutdown] clean exit');
            process.exit(0);
        });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

    // Crash loudly on unexpected errors but let Railway's restart policy
    // recover the container. Better than silently degrading.
    process.on('unhandledRejection', (reason) => {
        console.error('[fatal] unhandledRejection:', reason);
    });
    process.on('uncaughtException', (err) => {
        console.error('[fatal] uncaughtException:', err);
        process.exit(1);
    });
})();
