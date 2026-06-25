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
    description: 'A UK AI consultancy helping healthcare and professional service organisations deploy AI securely and responsibly.',
    image: 'https://zeffron.ai/assets/home-hero-consulting.png',
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
        'Responsible AI deployment',
        'AI governance',
        'Data science',
        'Machine learning modelling',
        'RAG systems',
        'Agent systems',
        'AI privacy and security',
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
        q: 'What kind of projects are a fit?',
        a: 'Research-heavy or workflow-heavy problems where data, model choice, evaluation, and deployment all matter.',
    },
    {
        q: 'Do we need to know the stack already?',
        a: 'No. Start with the problem. We choose the model, tools, and deployment path after we understand the data and constraints.',
    },
    {
        q: 'How do you handle sensitive information?',
        a: 'We design around data boundaries from the start. That includes what data is needed, where it is stored, who can access it, whether external model calls are appropriate, and where human review or audit logging is required.',
    },
    {
        q: 'Can you work with our existing tools?',
        a: 'Yes. We map the current workflow first, then integrate with the systems, documents, and processes that already matter.',
    },
    {
        q: 'What does a first engagement usually look like?',
        a: 'Most engagements start with an opportunity audit or scoped pilot. We identify high-value problems, define the risk constraints, design the solution, and agree how impact will be measured before building.',
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
    title: 'Zeffron — Secure AI Consulting for Regulated Teams | UK',
    description: 'Zeffron helps service businesses deploy AI securely inside real operations, reducing admin work and improving customer experience without losing control.',
    keywords: 'secure AI consulting UK, AI consulting regulated industries, healthcare AI consulting, hospitality AI automation, legal AI consulting, insurance AI automation, responsible AI deployment',
    canonical: 'https://zeffron.ai/',
    activeNav: 'home',
    bodyClass: 'home-consultancy-page',
    ogImage: 'https://zeffron.ai/assets/home-hero-consulting.png',
    ogImageType: 'image/png',
    ogImageWidth: 1672,
    ogImageHeight: 941,
    ogImageAlt: 'Zeffron — secure AI consulting for regulated teams',
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
            name: 'Zeffron — Secure AI Consulting for Regulated Teams | UK',
            description: 'Zeffron helps service businesses deploy AI securely inside real operations, reducing admin work and improving customer experience without losing control.',
            isPartOf: { '@id': 'https://zeffron.ai/#website' },
            about: { '@id': 'https://zeffron.ai' },
            primaryImageOfPage: {
                '@type': 'ImageObject',
                url: 'https://zeffron.ai/assets/home-hero-consulting.png',
                width: 1672,
                height: 941,
            },
            inLanguage: 'en-GB',
        },
        {
            '@context': 'https://schema.org',
            '@type': 'ProfessionalService',
            name: 'Zeffron',
            url: 'https://zeffron.ai/',
            image: 'https://zeffron.ai/assets/home-hero-consulting.png',
            logo: 'https://zeffron.ai/assets/PNG/Logo%20-%20White@2x.png',
            priceRange: '££££',
            address: { '@type': 'PostalAddress', addressLocality: 'London', addressRegion: 'England', addressCountry: 'GB' },
            areaServed: { '@type': 'Country', name: 'United Kingdom' },
            serviceType: ['Secure AI consulting', 'Responsible AI deployment', 'Healthcare AI consulting', 'Hospitality AI automation', 'Professional services automation', 'AI workflow automation'],
            hasOfferCatalog: {
                '@type': 'OfferCatalog',
                name: 'Zeffron services',
                itemListElement: [
                    { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'AI Opportunity Discovery', description: 'Map workflows, documents, customer moments, and data constraints where AI can create measurable value.' } },
                    { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Secure AI Workflow Design', description: 'Shape assistants, automations, and retrieval systems around real operational workflows.' } },
                    { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'AI Deployment and Measurement', description: 'Deploy privacy-conscious AI systems and track saved time, response speed, adoption, and quality.' } },
                    { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Responsible AI Deployment', description: 'Design and deploy AI systems with privacy, security, human review, and measurement built in.' } },
                ],
            },
        },
        homeFaqJsonLd,
    ],
};

app.get('/', (_req, res) => res.render('home', homeLocals));
app.get(['/work', '/services', '/faq', '/contact'], (_req, res) => res.render('home', homeLocals));
app.get('/research', (_req, res) => res.render('research', {
    title: 'AI Research & Engineering Vertical | Zeffron',
    description: 'Research, data science, ML modelling, retrieval, fine-tuning, agents, and evaluation harnesses for production AI systems.',
    keywords: 'AI research UK, data science consulting, ML modelling, fine-tuning, RAG systems, agent systems, AI evaluation harnesses',
    canonical: 'https://zeffron.ai/research',
    activeNav: 'research',
    bodyClass: 'research-page',
    ogImage: 'https://zeffron.ai/assets/rag_is_easy.jpeg',
    ogImageType: 'image/jpeg',
    ogImageAlt: 'Zeffron research and engineering vertical',
    jsonLd: [
        organization,
        {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: 'AI Research & Engineering Vertical | Zeffron',
            url: 'https://zeffron.ai/research',
            description: 'Research, data science, ML modelling, retrieval, fine-tuning, agents, and evaluation harnesses for production AI systems.',
            isPartOf: { '@id': 'https://zeffron.ai/#website' },
            about: { '@id': 'https://zeffron.ai' },
            inLanguage: 'en-GB',
        },
    ],
}));

const sharedHomeVariantContent = {
    sectors: [
        { label: 'Healthcare', href: '/home/clinical-calm' },
        { label: 'Hospitality', href: '/home/hospitality-service' },
        { label: 'Legal', href: '/home/trust-ledger' },
        { label: 'Financial services', href: '/home/executive-editorial' },
        { label: 'Insurance', href: '/home/insurance-controls' },
        { label: 'Recruitment', href: '/home/recruitment-workflows' },
        { label: 'Manufacturing', href: '/home/operator-console' },
        { label: 'Ecommerce', href: '/home/human-service' },
        { label: 'SWE + Applied AI', href: '/home/applied-ai-engineering' },
    ],
    stack: [
        { name: 'Hugging Face', logo: 'https://cdn.simpleicons.org/huggingface/FCC01A', alt: 'Hugging Face logo' },
        { name: 'Weights & Biases', logo: 'https://cdn.simpleicons.org/weightsandbiases/FFBE00', alt: 'Weights & Biases logo' },
        { name: 'OpenAI', logo: 'https://cdn.simpleicons.org/openai/111111', alt: 'OpenAI logo' },
        { name: 'GitHub', logo: 'https://cdn.simpleicons.org/github/111111', alt: 'GitHub logo' },
        { name: 'Python', logo: 'https://cdn.simpleicons.org/python/3776AB', alt: 'Python logo' },
        { name: 'PyTorch', logo: 'https://cdn.simpleicons.org/pytorch/EE4C2C', alt: 'PyTorch logo' },
        { name: 'dbt', logo: 'https://cdn.simpleicons.org/dbt/FF694B', alt: 'dbt logo' },
        { name: 'MLflow', logo: 'https://cdn.simpleicons.org/mlflow/0194E2', alt: 'MLflow logo' },
    ],
    capabilities: [
        { title: 'Fine-tuning', text: 'Adapt models when retrieval is not enough.' },
        { title: 'Harness', text: 'Test prompts, workflows, and release criteria.' },
        { title: 'Agents', text: 'Bounded workflows with clear review points.' },
        { title: 'Evaluation', text: 'Quality checks before production rollout.' },
        { title: 'ML modelling', text: 'Models tied to operational decisions.' },
        { title: 'Data science', text: 'Analysis that finds measurable workflow value.' },
    ],
    drags: [
        'Administrative overload',
        'Customer response delays',
        'Manual workflows',
        'Knowledge trapped in documents',
        'Privacy and AI concerns',
    ],
    method: [
        { label: '01', title: 'Discover opportunities', text: 'Map workflows, documents, customer moments, and data constraints where AI can create measurable value.' },
        { label: '02', title: 'Design solutions', text: 'Shape assistants, automations, and retrieval systems around how the team already works.' },
        { label: '03', title: 'Deploy securely', text: 'Implement privacy-conscious systems with permissions, review points, and clear ownership.' },
        { label: '04', title: 'Measure impact', text: 'Track saved time, response speed, adoption, quality, and the next high-value workflow.' },
    ],
    research: [
        { label: 'Research', title: 'How AI reduces administrative burden', text: 'Operational analysis, workflow mapping, and ROI framing for service teams.' },
        { label: 'Modelling', title: 'Fine-tuning, retrieval, and agents', text: 'When to use custom models, when to use retrieval, and how agent workflows fit real operations.' },
        { label: 'Evaluation', title: 'Measure before you scale', text: 'Harnesses, test sets, quality checks, and practical release criteria for production AI.' },
    ],
};

const workflowLogo = (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

const homeVariants = [
    {
        key: 'v1',
        path: '/home/trust-ledger',
        name: 'Trust Ledger',
        layout: 'ledger',
        vertical: {
            name: 'Legal operations',
            shortName: 'Legal',
            href: '/home/trust-ledger',
            text: 'Matter intake, client updates, contract workflows, document retrieval, and review-heavy admin.',
        },
        workflowTitle: 'Legal workflow stack.',
        workflowIntro: 'Legal buyers need to see the tools around matter management, signing, documents, communication, and controlled AI review.',
        workflowStack: [
            { name: 'Clio', logo: workflowLogo('goclio.com'), alt: 'Clio logo', role: 'Matter management' },
            { name: 'DocuSign', logo: workflowLogo('docusign.com'), alt: 'DocuSign logo', role: 'Signing workflows' },
            { name: 'Microsoft 365', logo: workflowLogo('microsoft.com'), alt: 'Microsoft logo', role: 'Office documents' },
            { name: 'SharePoint', logo: workflowLogo('sharepoint.com'), alt: 'SharePoint logo', role: 'Knowledge store' },
            { name: 'Google Drive', logo: 'https://cdn.simpleicons.org/googledrive/4285F4', alt: 'Google Drive logo', role: 'File workflows' },
            { name: 'Slack', logo: workflowLogo('slack.com'), alt: 'Slack logo', role: 'Team requests' },
            { name: 'OpenAI', logo: 'https://cdn.simpleicons.org/openai/111111', alt: 'OpenAI logo', role: 'AI layer' },
            { name: 'LangChain', logo: workflowLogo('langchain.com'), alt: 'LangChain logo', role: 'Agent orchestration' },
        ],
        mood: 'Swiss governance, procurement confidence, service-design restraint.',
        sourceIdea: 'GOV.UK-style user-need clarity, Carbon-like grid discipline, board-level proof.',
        bodyClass: 'variant-ledger',
        image: '/assets/home-legal-consulting.webp',
        socialImage: '/assets/social/legal-ai-consulting.jpg',
        heroLabel: 'Legal AI consulting',
        headline: 'Deploy AI inside legal operations without losing control.',
        subhead: 'Reduce matter intake, document review, client updates, and admin work while keeping review points visible.',
        artTitle: 'Legal adoption, measured by operational impact.',
        artText: 'Discovery, design, deployment, and measurement for law firms and legal teams.',
        metrics: ['Matter workflow mapped', 'Document boundary set', 'Review path agreed'],
    },
    {
        key: 'v2',
        path: '/home/clinical-calm',
        name: 'Clinical Calm',
        layout: 'clinical',
        vertical: {
            name: 'Healthcare',
            shortName: 'Healthcare',
            href: '/home/clinical-calm',
            text: 'Patient intake, clinical administration, referrals, scheduling, policy search, and reviewed communication—designed around your existing care pathways.',
        },
        workflowTitle: 'Built to work with your healthcare systems.',
        workflowIntro: 'We design around the records, interoperability standards, communication tools, and operational platforms your teams already depend on.',
        workflowStack: [
            { name: 'Epic', logo: workflowLogo('epic.com'), alt: 'Epic logo', role: 'EHR workflows' },
            { name: 'Oracle Health', logo: workflowLogo('oracle.com'), alt: 'Oracle logo', role: 'Clinical records' },
            { name: 'HL7 FHIR', logo: workflowLogo('hl7.org'), alt: 'HL7 logo', role: 'Interoperability' },
            { name: 'Microsoft Azure', logo: workflowLogo('azure.microsoft.com'), alt: 'Microsoft Azure logo', role: 'Secure cloud' },
            { name: 'Salesforce Health Cloud', logo: workflowLogo('salesforce.com'), alt: 'Salesforce logo', role: 'Patient operations' },
            { name: 'Zoom', logo: workflowLogo('zoom.us'), alt: 'Zoom logo', role: 'Virtual care' },
            { name: 'DocuSign', logo: workflowLogo('docusign.com'), alt: 'DocuSign logo', role: 'Consent workflows' },
            { name: 'OpenAI', logo: 'https://cdn.simpleicons.org/openai/111111', alt: 'OpenAI logo', role: 'AI layer' },
        ],
        mood: 'Clean healthcare trust, generous light space, measured and low-friction.',
        sourceIdea: 'Accessibility-first contrast, clinical information hierarchy, calm service language.',
        bodyClass: 'variant-clinical',
        seoTitle: 'Healthcare AI Consulting | Secure Clinical Workflow Automation | Zeffron',
        seoDescription: 'Secure AI consulting for healthcare organisations. Reduce clinical administration, improve patient response times, and deploy reviewed AI workflows with clear governance.',
        image: '/assets/home-healthcare-consulting.webp',
        socialImage: '/assets/social/healthcare-ai-consulting.jpg',
        heroLabel: 'Healthcare AI consulting',
        headline: 'Give your healthcare teams more time for patient care.',
        subhead: 'We build secure AI systems that reduce administrative workload, improve response times, and fit the way your clinical and operational teams already work.',
        artTitle: 'Improve capacity without compromising patient trust.',
        artText: 'Every deployment includes clear privacy boundaries, human review, accountable ownership, and measurable operational goals.',
        metrics: ['Less clinical admin', 'Faster patient response', 'Human oversight built in'],
        ctaHeadline: 'Start with the healthcare workflow that will create the most value.',
        ctaCopy: 'Tell us where administration, delays, or fragmented information are limiting your team. We will identify a practical first deployment and the safeguards needed to deliver it responsibly.',
        ctaSecondaryLabel: 'Send a brief',
        ctaSecondaryAction: 'brief',
    },
    {
        key: 'v3',
        path: '/home/executive-editorial',
        name: 'Executive Editorial',
        layout: 'editorial',
        vertical: {
            name: 'Financial services for MSPs',
            shortName: 'Financial services',
            href: '/home/executive-editorial',
            text: 'Open banking, investment and wealth journeys, client onboarding, KYC and AML support, reporting, reconciliation, data quality, and regulated customer service.',
        },
        workflowTitle: 'Built to work across the financial-services stack.',
        workflowIntro: 'We integrate open-banking data, CRM, payments, accounting, investment platforms, analytics, and governed AI into services your MSP can operate and support.',
        workflowStack: [
            { name: 'Salesforce', logo: workflowLogo('salesforce.com'), alt: 'Salesforce logo', role: 'Client CRM' },
            { name: 'Stripe', logo: workflowLogo('stripe.com'), alt: 'Stripe logo', role: 'Payments infrastructure' },
            { name: 'Plaid', logo: workflowLogo('plaid.com'), alt: 'Plaid logo', role: 'Open banking data' },
            { name: 'Xero', logo: workflowLogo('xero.com'), alt: 'Xero logo', role: 'Accounting data' },
            { name: 'QuickBooks', logo: workflowLogo('quickbooks.intuit.com'), alt: 'QuickBooks logo', role: 'SME finance' },
            { name: 'Snowflake', logo: workflowLogo('snowflake.com'), alt: 'Snowflake logo', role: 'Data warehouse' },
            { name: 'Databricks', logo: workflowLogo('databricks.com'), alt: 'Databricks logo', role: 'Data science' },
            { name: 'OpenAI', logo: 'https://cdn.simpleicons.org/openai/111111', alt: 'OpenAI logo', role: 'AI layer' },
        ],
        mood: 'Boardroom editorial, cinematic confidence, premium consulting authority.',
        sourceIdea: 'High-contrast editorial hierarchy, restrained brand blue, human operations photography.',
        bodyClass: 'variant-editorial',
        seoTitle: 'Financial Services AI for MSPs | Open Banking & Investment Workflows | Zeffron',
        seoDescription: 'Zeffron helps MSPs deliver secure AI and data services for financial-services customers, including open banking, investment journeys, onboarding, reporting, and compliance workflows.',
        image: '/assets/home-financial-consulting.webp',
        socialImage: '/assets/social/financial-services-ai.jpg',
        imageAlt: 'Financial services team reviewing secure data, investment, and customer workflow systems',
        heroLabel: 'Financial services solutions for MSPs',
        headline: 'Help your financial-services customers make faster, better-informed choices.',
        subhead: 'We help MSPs build and operate secure products across open banking, investments, onboarding, reporting, customer service, and regulated data workflows.',
        artTitle: 'A service your MSP can deliver, govern, and scale.',
        artText: 'We combine product engineering, financial-data integration, AI evaluation, human review, and operational monitoring into a supportable managed service.',
        metrics: ['Open-banking ready', 'Human review retained', 'Managed service designed'],
        editorialKicker: 'MSP growth opportunity',
        editorialLede: 'Turn financial data and AI into services your customers will pay for.',
        editorialCopy: 'Give banks, lenders, wealth firms, advisers, fintechs, and accounting customers better digital journeys without asking your MSP to build every integration, control, and AI workflow from scratch.',
        focusLabel: 'Who it serves',
        focusTitle: 'Financial-services customers with complex data and regulated workflows.',
        principles: [
            { label: '01 / Revenue', title: 'Create new managed-service revenue.', text: 'Package open-banking insights, intelligent onboarding, reporting, customer support, and workflow automation as repeatable services your MSP can sell and support.' },
            { label: '02 / Choice', title: 'Help customers understand their options.', text: 'Turn fragmented account, product, portfolio, and service information into clear, source-linked comparisons while keeping regulated recommendations with authorised people.' },
            { label: '03 / Control', title: 'Build governance into the service.', text: 'Make permissions, consent, data lineage, human approval, audit trails, model evaluation, and escalation visible from the first release.' },
        ],
        useCases: [
            { title: 'Open-banking account insights', text: 'Connect consented account data, categorise transactions, identify cash-flow patterns, and present useful insights through customer or adviser experiences.' },
            { title: 'Investment choice and portfolio support', text: 'Explain approved product information, compare options and fees, summarise portfolio data, and prepare review material without replacing regulated financial advice.' },
            { title: 'Digital onboarding, KYC and AML support', text: 'Collect documents, check completeness, extract structured information, route exceptions, and keep compliance review explicit.' },
            { title: 'Lending and affordability workflows', text: 'Organise application data, surface missing evidence, summarise financial information, and support consistent human underwriting decisions.' },
            { title: 'Client reporting and adviser preparation', text: 'Prepare review packs, consolidate account and portfolio information, draft approved communications, and reduce manual reporting work.' },
            { title: 'Financial customer-service automation', text: 'Answer policy and account-service questions from approved sources, triage requests, and escalate complaints, vulnerability, or regulated conversations.' },
        ],
        methodHeadline: 'How we turn the opportunity into a managed service.',
        methodCopy: 'We work with your MSP to define the customer offer, integrate the financial data, build the product, establish controls, and prepare the service for ongoing support.',
        method: [
            { label: '01', title: 'Define the commercial service', text: 'Choose the financial customer segment, workflow, user outcome, pricing logic, and support model before committing to a build.' },
            { label: '02', title: 'Design data and compliance boundaries', text: 'Map consent, open-banking providers, customer systems, permissions, regulated decisions, security controls, and human approval points.' },
            { label: '03', title: 'Build and validate the product', text: 'Engineer the integrations and user experience, test data quality and AI behaviour, and validate realistic failure and escalation scenarios.' },
            { label: '04', title: 'Launch and operate with confidence', text: 'Deploy with monitoring, auditability, service ownership, documentation, incident processes, and measurable customer outcomes.' },
        ],
        ctaHeadline: 'Build the financial-services offer your MSP can take to market.',
        ctaCopy: 'Tell us which customers you serve and where open banking, investments, onboarding, reporting, or service automation could create value. We will help define a viable first product and delivery model.',
        ctaSecondaryLabel: 'Send a brief',
        ctaSecondaryAction: 'brief',
    },
    {
        key: 'v4',
        path: '/home/operator-console',
        name: 'Operator Console',
        layout: 'console',
        vertical: {
            name: 'Manufacturing',
            shortName: 'Manufacturing',
            href: '/home/operator-console',
            text: 'Production planning, quality control, maintenance, supply-chain exceptions, work instructions, reporting, and factory knowledge systems.',
        },
        workflowTitle: 'Built to work with your production systems.',
        workflowIntro: 'We connect ERP, industrial systems, engineering data, maintenance records, quality reporting, and operational analytics without forcing teams to replace the tools they rely on.',
        workflowStack: [
            { name: 'SAP', logo: 'https://cdn.simpleicons.org/sap/0FAAFF', alt: 'SAP logo', role: 'ERP operations' },
            { name: 'Siemens', logo: workflowLogo('siemens.com'), alt: 'Siemens logo', role: 'Industrial systems' },
            { name: 'Autodesk', logo: workflowLogo('autodesk.com'), alt: 'Autodesk logo', role: 'Design data' },
            { name: 'Dynamics 365', logo: workflowLogo('dynamics.microsoft.com'), alt: 'Microsoft Dynamics logo', role: 'ERP and CRM' },
            { name: 'Oracle', logo: workflowLogo('oracle.com'), alt: 'Oracle logo', role: 'Enterprise data' },
            { name: 'Snowflake', logo: workflowLogo('snowflake.com'), alt: 'Snowflake logo', role: 'Data warehouse' },
            { name: 'Databricks', logo: workflowLogo('databricks.com'), alt: 'Databricks logo', role: 'ML operations' },
            { name: 'Power BI', logo: workflowLogo('powerbi.microsoft.com'), alt: 'Power BI logo', role: 'Reporting' },
        ],
        signals: [
            { title: 'Production planning and exception management', text: 'Surface late orders, material constraints, scheduling conflicts, and capacity risks before they disrupt output.' },
            { title: 'Predictive maintenance and technician support', text: 'Organise maintenance history, identify recurring failure patterns, and give technicians faster access to approved procedures.' },
            { title: 'Quality inspection and root-cause analysis', text: 'Structure inspection results, detect recurring defects, and help teams connect quality issues to machines, materials, and process changes.' },
            { title: 'Supply-chain and supplier risk', text: 'Monitor delays, missing information, and supplier exceptions, then prioritise the actions most likely to protect production.' },
            { title: 'Factory knowledge and work instructions', text: 'Turn manuals, SOPs, engineering notes, and experienced-worker knowledge into cited answers available at the point of work.' },
        ],
        mood: 'Technical control room, stack credibility, dense but composed operational signal.',
        sourceIdea: 'Command-centre information architecture with WCAG-aware contrast and real tool logos.',
        bodyClass: 'variant-console',
        seoTitle: 'Manufacturing AI Consulting | Production & Factory Automation | Zeffron',
        seoDescription: 'AI consulting for manufacturers. Improve production planning, maintenance, quality, supply-chain response, and factory knowledge with secure operational systems.',
        image: '/assets/manufacturing-operations-consulting-v2.webp',
        socialImage: '/assets/social/manufacturing-ai-consulting.jpg',
        imageAlt: 'Manufacturing operations team reviewing production workflows and factory performance',
        heroLabel: 'Manufacturing AI consulting',
        headline: 'Improve production performance with clearer, faster operational decisions.',
        subhead: 'We build AI systems that reduce downtime, improve quality response, strengthen production planning, and make factory knowledge easier to use.',
        artTitle: 'Turn production data into action your teams can trust.',
        artText: 'Every deployment is designed around real plant constraints, existing systems, human ownership, and measurable operational results.',
        metrics: ['Less unplanned downtime', 'Faster exception response', 'Knowledge available on shift'],
        consoleHeadline: 'Focus AI on the outcomes that protect production.',
        consoleCopy: 'We start where delays, defects, downtime, or fragmented knowledge have a measurable effect on throughput, cost, safety, and customer delivery.',
        terminalLabel: 'Production controls',
        terminalLines: ['production.data -> connected', 'quality.exception -> prioritised', 'maintenance.action -> reviewed', 'work.instruction -> cited', 'human.owner -> assigned', 'impact.metric -> monitored'],
        signalLabel: 'Common use case',
        methodHeadline: 'How we set your manufacturing operation up for success.',
        methodCopy: 'We combine plant knowledge, production data, engineering constraints, and secure software delivery to move from one valuable workflow to a supportable production system.',
        method: [
            { label: '01', title: 'Choose the production outcome', text: 'Define the downtime, quality, planning, maintenance, or supply-chain result worth improving and establish a measurable baseline.' },
            { label: '02', title: 'Connect the operational context', text: 'Map ERP, MES, maintenance, quality, sensor, document, and reporting data together with access and safety boundaries.' },
            { label: '03', title: 'Build and validate on real scenarios', text: 'Engineer the workflow, test exceptions and failure modes, involve operators and engineers, and keep production decisions under human control.' },
            { label: '04', title: 'Deploy and improve in production', text: 'Release with monitoring, ownership, documentation, support processes, and performance measures tied to plant outcomes.' },
        ],
        ctaHeadline: 'Start with the manufacturing workflow affecting output most.',
        ctaCopy: 'Tell us where downtime, quality issues, planning exceptions, supplier delays, or inaccessible knowledge are creating cost. We will define a practical first deployment and the systems needed to support it.',
        ctaSecondaryLabel: 'Send a brief',
        ctaSecondaryAction: 'brief',
    },
    {
        key: 'v5',
        path: '/home/human-service',
        name: 'Human Service',
        layout: 'human',
        vertical: {
            name: 'Ecommerce and retail',
            shortName: 'Ecommerce',
            href: '/home/human-service',
            text: 'Customer service, order admin, returns, campaign operations, product data, and support workflows.',
        },
        workflowTitle: 'Ecommerce workflow stack.',
        workflowIntro: 'This variant tests practical buyer recognition: the tools ecommerce teams already use to sell, respond, reconcile, and retain customers.',
        workflowStack: [
            { name: 'Shopify', logo: 'https://cdn.simpleicons.org/shopify/95BF47', alt: 'Shopify logo', role: 'Storefront' },
            { name: 'WhatsApp', logo: 'https://cdn.simpleicons.org/whatsapp/25D366', alt: 'WhatsApp logo', role: 'Customer messaging' },
            { name: 'Gmail', logo: 'https://cdn.simpleicons.org/gmail/EA4335', alt: 'Gmail logo', role: 'Inbox workflows' },
            { name: 'Google Sheets', logo: 'https://cdn.simpleicons.org/googlesheets/34A853', alt: 'Google Sheets logo', role: 'Ops tracking' },
            { name: 'Klaviyo', logo: workflowLogo('klaviyo.com'), alt: 'Klaviyo logo', role: 'Lifecycle marketing' },
            { name: 'Stripe', logo: workflowLogo('stripe.com'), alt: 'Stripe logo', role: 'Payments' },
            { name: 'Zendesk', logo: 'https://cdn.simpleicons.org/zendesk/03363D', alt: 'Zendesk logo', role: 'Support desk' },
            { name: 'Meta Ads', logo: workflowLogo('meta.com'), alt: 'Meta logo', role: 'Acquisition' },
        ],
        mood: 'Warm professional service, tactile photography, practical language for non-technical buyers.',
        sourceIdea: 'Human-centred service pages, tactile visual texture, simple problem-impact-solution flow.',
        bodyClass: 'variant-human',
        image: '/assets/home-recruitment-consulting.webp',
        socialImage: '/assets/social/ecommerce-ai-consulting.jpg',
        heroLabel: 'Ecommerce AI consulting',
        headline: 'Reduce ecommerce admin without removing human service.',
        subhead: 'Zeffron designs AI systems around orders, customer messages, product data, returns, and campaign operations.',
        artTitle: 'Technology that protects the customer relationship.',
        artText: 'Every engagement starts with the work your team repeats, delays, or cannot scale safely.',
        metrics: ['People stay in control', 'Orders become clearer', 'Response time improves'],
    },
    {
        key: 'v6',
        path: '/home/applied-ai-engineering',
        name: 'Applied AI Engineering',
        layout: 'engineering',
        vertical: {
            name: 'Software engineering and applied AI',
            shortName: 'Software and AI',
            href: '/home/applied-ai-engineering',
            text: 'Product strategy, UX, mobile and web applications, backend systems, AI agents, integrations, evaluation, deployment, and long-term product ownership.',
        },
        workflowStack: [
            { name: 'React Native', logo: 'https://cdn.simpleicons.org/react/61DAFB', alt: 'React Native logo', role: 'Mobile apps' },
            { name: 'Expo', logo: 'https://cdn.simpleicons.org/expo/000020', alt: 'Expo logo', role: 'Mobile delivery' },
            { name: 'Swift', logo: 'https://cdn.simpleicons.org/swift/F05138', alt: 'Swift logo', role: 'iOS builds' },
            { name: 'Kotlin', logo: 'https://cdn.simpleicons.org/kotlin/7F52FF', alt: 'Kotlin logo', role: 'Android builds' },
            { name: 'Next.js', logo: 'https://cdn.simpleicons.org/nextdotjs/111111', alt: 'Next.js logo', role: 'Web apps' },
            { name: 'Vercel', logo: 'https://cdn.simpleicons.org/vercel/111111', alt: 'Vercel logo', role: 'Frontend platform' },
            { name: 'Supabase', logo: 'https://cdn.simpleicons.org/supabase/3FCF8E', alt: 'Supabase logo', role: 'Product backend' },
            { name: 'PostgreSQL', logo: 'https://cdn.simpleicons.org/postgresql/4169E1', alt: 'PostgreSQL logo', role: 'Structured data' },
            { name: 'GitHub', logo: 'https://cdn.simpleicons.org/github/111111', alt: 'GitHub logo', role: 'Engineering workflow' },
            { name: 'OpenAI', logo: 'https://cdn.simpleicons.org/openai/111111', alt: 'OpenAI logo', role: 'AI layer' },
            { name: 'LangGraph', logo: workflowLogo('langchain.com'), alt: 'LangGraph logo', role: 'Agent graphs' },
            { name: 'Anthropic', logo: workflowLogo('anthropic.com'), alt: 'Anthropic logo', role: 'Model options' },
        ],
        firstSectionHeadline: 'Turn a valuable business opportunity into software people can rely on.',
        firstSectionCopy: 'We take responsibility for the complete product: understanding the user, designing the experience, building the application and backend, integrating AI safely, and preparing the system for real customers and operations.',
        focusLabel: 'What we deliver',
        focusTitle: 'A complete product, not an isolated AI feature.',
        terminalLines: [
            'Clear commercial outcome and release scope',
            'Product experience designed around real users',
            'Secure application, backend, and integrations',
            'AI quality evaluated against realistic scenarios',
            'Monitoring, fallback, and support processes',
            'Code, IP, documentation, and ownership transferred',
        ],
        tracksHeadline: 'Choose the product your business needs next.',
        tracksCopy: 'We build customer-facing and operational software around the outcome you need—whether that means launching a new product, modernising a workflow, or adding reliable AI to an existing service.',
        tracks: [
            { label: '01', title: 'Mobile products', text: 'Launch polished iOS and Android experiences with onboarding, accounts, payments, notifications, analytics, offline states, and useful AI built into the journey.' },
            { label: '02', title: 'Web platforms and business systems', text: 'Build portals, dashboards, SaaS products, internal tools, marketplaces, data workflows, APIs, and secure backends that support revenue or reduce operating cost.' },
            { label: '03', title: 'AI agents and intelligent workflows', text: 'Automate bounded work across documents, systems, and teams using retrieval, tool access, approval gates, evaluation, monitoring, and human escalation.' },
        ],
        workflowTitle: 'A modern stack chosen around your product.',
        workflowIntro: 'We select proven technologies based on users, scale, security, data, integrations, team capability, and ownership—not because a framework happens to be fashionable.',
        signalsHeadline: 'Common products and challenges we help solve.',
        signalsCopy: 'These are the points where product thinking, software engineering, and applied AI need to work as one delivery discipline.',
        signals: [
            { title: 'Launch a new digital product', text: 'Turn a validated opportunity into a customer-ready mobile app, web platform, or SaaS product with a credible route to market.' },
            { title: 'Modernise a manual operation', text: 'Replace spreadsheets, inbox coordination, repeated data entry, and fragmented tools with one reliable workflow.' },
            { title: 'Add AI to an existing product', text: 'Introduce search, recommendations, assistants, generation, or automation inside the experience users already understand.' },
            { title: 'Move an AI prototype into production', text: 'Rebuild fragile demos around real data, authentication, permissions, integrations, testing, monitoring, and operational fallback.' },
            { title: 'Create a controlled agent workflow', text: 'Let AI perform bounded multi-step work with approved tools, clear authority, human escalation, and measurable quality.' },
        ],
        methodHeadline: 'How we set your product up for long-term success.',
        methodCopy: 'We reduce risk early, ship in controlled stages, and leave you with a product, codebase, documentation, and operating model your team can own.',
        method: [
            { label: '01', title: 'Define the business outcome', text: 'Align users, commercial value, workflow, scope, constraints, success measures, and what should not be built yet.' },
            { label: '02', title: 'Design and prove the experience', text: 'Create the product flows, architecture, data model, AI behaviour, integrations, and a working prototype before scaling the build.' },
            { label: '03', title: 'Engineer and release safely', text: 'Build production software, test critical paths and AI quality, instrument failures, and deploy through staged environments.' },
            { label: '04', title: 'Measure, improve, and transfer ownership', text: 'Track adoption and business impact, improve the product using real feedback, and provide the code, documentation, and knowledge your team needs.' },
        ],
        mood: 'Product engineering, applied AI systems, technical buyer confidence, startup-to-production pace.',
        sourceIdea: 'SWE + AI delivery page for product leaders, operators, and technical teams who need shipped software rather than strategy decks.',
        bodyClass: 'variant-engineering',
        seoTitle: 'Software Engineering & Applied AI Agency | Product Development | Zeffron',
        seoDescription: 'Zeffron designs and builds mobile apps, web platforms, SaaS products, AI agents, and intelligent workflows from product strategy through production deployment.',
        image: '/assets/home-applied-ai-engineering.png',
        socialImage: '/assets/social/applied-ai-engineering.jpg',
        imageAlt: 'Product engineering system showing mobile app, web app dashboard, backend data store, and multi-agent workflow graph',
        heroLabel: 'Software engineering + applied AI',
        headline: 'Build the product that moves your business forward.',
        subhead: 'We design and engineer mobile apps, web platforms, SaaS products, and AI systems that create revenue, reduce operating cost, or improve the service your customers receive.',
        secondaryCta: 'Explore what we build',
        artTitle: 'One senior team from product definition to production.',
        artText: 'Strategy, design, software, data, AI, testing, deployment, and handover are managed as one accountable delivery process.',
        metrics: ['Business outcome defined', 'Production quality built in', 'Code and IP belong to you'],
        ctaHeadline: 'Turn your next product or AI opportunity into a working system.',
        ctaCopy: 'Tell us what your business needs to launch, improve, or automate. We will help define the right product, identify the delivery risks, and recommend the strongest first release.',
        ctaSecondaryLabel: 'Send a brief',
        ctaSecondaryAction: 'brief',
    },
    {
        key: 'v7',
        path: '/home/hospitality-service',
        name: 'Hospitality Service',
        layout: 'human',
        vertical: {
            name: 'Hospitality and travel',
            shortName: 'Hospitality and travel',
            href: '/home/hospitality-service',
            text: 'Holiday enquiries, reservations, flights, visa guidance, itineraries, transfers, guest communication, and live-service handoffs—designed around the way your teams already support travellers.',
        },
        workflowTitle: 'Built to work across the travel journey.',
        workflowIntro: 'We connect reservation, flight, itinerary, guest messaging, CRM, payment, and operational systems so teams can support travellers from enquiry to return.',
        workflowStack: [
            { name: 'Amadeus', logo: workflowLogo('amadeus.com'), alt: 'Amadeus logo', role: 'Flights and travel inventory' },
            { name: 'Booking.com', logo: workflowLogo('booking.com'), alt: 'Booking.com logo', role: 'Accommodation' },
            { name: 'Expedia', logo: workflowLogo('expedia.com'), alt: 'Expedia logo', role: 'Trips and packages' },
            { name: 'Stripe', logo: workflowLogo('stripe.com'), alt: 'Stripe logo', role: 'Travel payments' },
            { name: 'WhatsApp', logo: 'https://cdn.simpleicons.org/whatsapp/25D366', alt: 'WhatsApp logo', role: 'Guest messaging' },
            { name: 'HubSpot', logo: workflowLogo('hubspot.com'), alt: 'HubSpot logo', role: 'CRM' },
            { name: 'Google Maps', logo: workflowLogo('maps.google.com'), alt: 'Google Maps logo', role: 'Routes and destinations' },
            { name: 'OpenAI', logo: 'https://cdn.simpleicons.org/openai/111111', alt: 'OpenAI logo', role: 'AI layer' },
        ],
        mood: 'Operational hospitality, calm service design, live-service confidence.',
        sourceIdea: 'Hospitality operations page for teams managing bookings, guest communication, and multi-site service load.',
        bodyClass: 'variant-human',
        image: '/assets/hospitality-travel-consulting-v2.webp',
        socialImage: '/assets/social/hospitality-travel-ai.jpg',
        imageAlt: 'Travellers planning an international holiday with a travel concierge, luggage, passports, and a coastal destination',
        seoTitle: 'Hospitality & Travel AI Consulting | Booking and Trip Automation | Zeffron',
        seoDescription: 'AI consulting for hospitality and travel businesses. Improve holiday enquiries, bookings, flight and visa support, itineraries, and traveller communication.',
        heroLabel: 'Hospitality and travel AI consulting',
        headline: 'Help travellers plan, book, and enjoy every trip with less friction.',
        subhead: 'We build AI systems for holiday enquiries, reservations, flights, visa guidance, itineraries, transfers, and guest support—giving your team more time for high-value service.',
        artTitle: 'One connected experience from enquiry to destination.',
        artText: 'Support travellers with timely information, coordinated trip details, human escalation, and measurable service standards.',
        metrics: ['Faster travel enquiries', 'Less booking admin', '24/7 trip support'],
        journeyKicker: 'Travel outcomes',
        journeyHeadline: 'Make every stage of the journey easier to manage.',
        journeyCopy: 'We connect fragmented travel information and automate repeated service work so travellers receive faster, clearer support before, during, and after their trip.',
        journeyCards: [
            { label: 'Traveller experience', title: 'Give travellers clear answers at every stage.', text: 'Support enquiries about destinations, availability, flights, documents, transfers, accommodation, and changes across every service channel.' },
            { label: 'Team capacity', title: 'Give advisors more time for complex trips.', text: 'Reduce repeated searches, manual itinerary updates, status checks, document reminders, and coordination between suppliers.' },
            { label: 'Operational control', title: 'Keep people involved when plans change.', text: 'Use approved guidance, human escalation, access controls, and disruption fallback paths. We can sign an NDA before detailed discovery.' },
        ],
        focusHeadline: 'AI built around the complete traveller journey.',
        focusCopy: 'From destination discovery and visa preparation to flights, accommodation, transfers, in-trip support, and follow-up, we design around your service model and existing systems.',
        focusLabel: 'Where we can help',
        focusTitle: 'Improve the moments that shape a successful trip.',
        useCases: [
            { title: 'Holiday discovery and package enquiries', text: 'Match travellers with suitable destinations, accommodation, activities, and packages using their dates, budget, preferences, and travel party.' },
            { title: 'Flight and accommodation support', text: 'Answer availability and policy questions, compare approved options, organise booking details, and route complex changes to an advisor.' },
            { title: 'Visa and travel-document guidance', text: 'Provide source-linked document checklists, deadline reminders, and application guidance while escalating eligibility decisions to qualified staff.' },
            { title: 'Itinerary creation and trip coordination', text: 'Combine flights, hotels, activities, transfers, reservations, and traveller notes into clear, updateable itineraries.' },
            { title: 'Transfers and in-destination support', text: 'Coordinate airport pickups, local transport, arrival instructions, service requests, and disruption updates across messaging channels.' },
            { title: 'Travel disruption and rebooking triage', text: 'Identify affected travellers, communicate approved options, prioritise urgent cases, and support staff with coordinated rebooking workflows.' },
        ],
        methodHeadline: 'How we set your hospitality or travel business up for success.',
        methodCopy: 'We start with one valuable traveller workflow, build around supplier and operational constraints, and prove the result before expanding.',
        method: [
            { label: '01', title: 'Choose the right workflow', text: 'We identify where delays, repeated questions, supplier handoffs, or fragmented trip information have the greatest effect on travellers and advisors.' },
            { label: '02', title: 'Design around the journey', text: 'We map booking and supplier integrations, approved guidance, escalation paths, data access, and the experience for travellers and staff.' },
            { label: '03', title: 'Deploy without disruption', text: 'We test real booking and travel scenarios, train the team, and release with monitoring, ownership, and fallback processes in place.' },
            { label: '04', title: 'Measure service impact', text: 'We track response speed, workload reduction, escalation quality, adoption, and traveller-service consistency before expanding.' },
        ],
        ctaHeadline: 'Start with the travel workflow that will improve service fastest.',
        ctaCopy: 'Tell us where holiday enquiries, flights, visas, bookings, itineraries, transfers, or traveller support are creating pressure. We will identify a practical first deployment and the controls needed to run it reliably.',
        ctaSecondaryLabel: 'Send a brief',
        ctaSecondaryAction: 'brief',
    },
    {
        key: 'v8',
        path: '/home/insurance-controls',
        name: 'Insurance Controls',
        layout: 'ledger',
        vertical: {
            name: 'Insurance',
            shortName: 'Insurance',
            href: '/home/insurance-controls',
            text: 'Quote triage, submissions, policy administration, renewals, claims support, broker-system integration, customer communication, and exception handling.',
        },
        workflowTitle: 'Built to work across insurance operations.',
        workflowIntro: 'We connect broker platforms, insurer portals, CRM, documents, reporting, and governed AI into workflows your teams can operate, review, and audit.',
        workflowStack: [
            { name: 'Acturis', logo: workflowLogo('acturis.com'), alt: 'Acturis logo', role: 'Broker platform' },
            { name: 'Applied Epic', logo: workflowLogo('appliedsystems.com'), alt: 'Applied Systems logo', role: 'Broker management' },
            { name: 'Salesforce', logo: workflowLogo('salesforce.com'), alt: 'Salesforce logo', role: 'CRM' },
            { name: 'Microsoft 365', logo: workflowLogo('microsoft.com'), alt: 'Microsoft logo', role: 'Documents and email' },
            { name: 'DocuSign', logo: workflowLogo('docusign.com'), alt: 'DocuSign logo', role: 'Signed documents' },
            { name: 'Power BI', logo: workflowLogo('powerbi.microsoft.com'), alt: 'Power BI logo', role: 'Reporting' },
            { name: 'PostgreSQL', logo: 'https://cdn.simpleicons.org/postgresql/4169E1', alt: 'PostgreSQL logo', role: 'Structured data' },
            { name: 'OpenAI', logo: 'https://cdn.simpleicons.org/openai/111111', alt: 'OpenAI logo', role: 'AI layer' },
        ],
        mood: 'Controlled insurance operations, evidence-first workflow confidence.',
        sourceIdea: 'Insurance operations page for quote triage, renewals, regulated documents, and broker approval flows.',
        bodyClass: 'variant-ledger',
        seoTitle: 'Insurance AI Consulting | Broker, Policy & Claims Automation | Zeffron',
        seoDescription: 'AI consulting for insurers, brokers, and MGAs. Improve quote triage, renewals, policy administration, claims support, and customer service with auditable workflows.',
        image: '/assets/home-insurance-consulting.webp',
        socialImage: '/assets/social/insurance-ai-consulting.jpg',
        heroLabel: 'Insurance AI consulting',
        headline: 'Serve policyholders faster while giving teams clearer control.',
        subhead: 'We build auditable AI systems for submissions, quotes, renewals, policy administration, claims support, and customer communication.',
        artTitle: 'More capacity across the policy lifecycle.',
        artText: 'Reduce rekeying and repeated administration while keeping broker, underwriter, claims, and compliance review visible.',
        metrics: ['Faster quote response', 'Fewer manual handoffs', 'Audit trail retained'],
        ledgerKicker: 'Insurance outcomes',
        ledgerHeadline: 'Improve speed without weakening underwriting or claims control.',
        ledgerCopy: 'We target high-volume insurance workflows where better information, automation, and review queues can improve service, protect margin, and release skilled capacity.',
        ledgerColumns: ['Insurance workflow', 'Business outcome', 'Control retained'],
        ledgerRows: [
            { title: 'Submission and quote triage', signal: 'Prioritise complete, in-scope opportunities and respond to brokers faster.', response: 'Underwriter rules, exception queues, source documents, and human approval.' },
            { title: 'Renewals and policy administration', signal: 'Reduce chasing, rekeying, missed actions, and avoidable renewal leakage.', response: 'Broker ownership, validation checks, audit history, and escalation.' },
            { title: 'Claims and customer support', signal: 'Give customers clearer updates and help handlers organise evidence sooner.', response: 'Claims-handler review, vulnerability escalation, permissions, and traceability.' },
        ],
        focusLabel: 'Where we can help',
        focusTitle: 'AI built around the policy lifecycle.',
        useCases: [
            { title: 'Submission intake and quote triage', text: 'Extract risk information, check completeness, identify appetite fit, and route cases to the appropriate broker or underwriter.' },
            { title: 'Renewal preparation and retention', text: 'Surface upcoming renewals, organise policy and claims history, prepare communications, and flag cases needing early attention.' },
            { title: 'Policy document processing', text: 'Compare schedules and endorsements, extract structured details, identify missing information, and reduce manual rekeying.' },
            { title: 'Claims intake and evidence support', text: 'Organise first-notification information, classify documents, identify missing evidence, and prepare handler-ready case summaries.' },
            { title: 'Broker and policyholder service', text: 'Answer approved policy and process questions, triage requests, draft updates, and escalate complaints or vulnerable-customer cases.' },
            { title: 'Compliance and operational reporting', text: 'Prepare auditable workflow reports, monitor exceptions, and give leaders clearer visibility into service and control performance.' },
        ],
        methodHeadline: 'How we set your insurance operation up for success.',
        methodCopy: 'We begin with a defined insurance outcome, map the policy and data boundaries, build around human authority, and prove performance before expanding.',
        method: [
            { label: '01', title: 'Select the valuable workflow', text: 'Choose a submission, policy, renewal, claims, or service process with clear volume, cost, delay, and customer-impact measures.' },
            { label: '02', title: 'Map rules, data, and authority', text: 'Define system integrations, underwriting or claims rules, document sources, permissions, review queues, and escalation paths.' },
            { label: '03', title: 'Build and test against exceptions', text: 'Engineer the workflow, validate accuracy and traceability, and test edge cases before any output affects a policy or customer.' },
            { label: '04', title: 'Deploy with measurable control', text: 'Release with monitoring, audit logs, ownership, support procedures, and service measures tied to operational outcomes.' },
        ],
        ctaHeadline: 'Start with the insurance workflow creating the most delay or leakage.',
        ctaCopy: 'Tell us where submissions, quotes, renewals, policy administration, claims, or customer service are creating pressure. We will define a practical first deployment and its control model.',
        ctaSecondaryLabel: 'Send a brief',
        ctaSecondaryAction: 'brief',
    },
    {
        key: 'v9',
        path: '/home/recruitment-workflows',
        name: 'Recruitment Workflows',
        layout: 'human',
        vertical: {
            name: 'Recruitment',
            shortName: 'Recruitment',
            href: '/home/recruitment-workflows',
            text: 'Candidate sourcing, screening, shortlist preparation, CRM hygiene, recruiter notes, client updates, interview coordination, and relationship-safe communication.',
        },
        workflowTitle: 'Built to work with your recruitment stack.',
        workflowIntro: 'We connect ATS, CRM, sourcing, job-board, email, reporting, and AI workflows around the systems your consultants already use.',
        workflowStack: [
            { name: 'Bullhorn', logo: workflowLogo('bullhorn.com'), alt: 'Bullhorn logo', role: 'ATS and CRM' },
            { name: 'Vincere', logo: workflowLogo('vincere.io'), alt: 'Vincere logo', role: 'Recruitment CRM' },
            { name: 'LinkedIn', logo: 'https://cdn.simpleicons.org/linkedin/0A66C2', alt: 'LinkedIn logo', role: 'Candidate sourcing' },
            { name: 'Indeed', logo: workflowLogo('indeed.com'), alt: 'Indeed logo', role: 'Job board' },
            { name: 'HubSpot', logo: workflowLogo('hubspot.com'), alt: 'HubSpot logo', role: 'Client CRM' },
            { name: 'Gmail', logo: 'https://cdn.simpleicons.org/gmail/EA4335', alt: 'Gmail logo', role: 'Email workflows' },
            { name: 'Google Sheets', logo: 'https://cdn.simpleicons.org/googlesheets/34A853', alt: 'Google Sheets logo', role: 'Ops tracking' },
            { name: 'OpenAI', logo: 'https://cdn.simpleicons.org/openai/111111', alt: 'OpenAI logo', role: 'AI layer' },
        ],
        mood: 'Relationship-first recruitment operations, human tone, practical workflow automation.',
        sourceIdea: 'Recruitment operations page for candidate screening, client updates, CRM hygiene, and consultant approval.',
        bodyClass: 'variant-human',
        seoTitle: 'Recruitment AI Consulting | ATS, Sourcing & Agency Automation | Zeffron',
        seoDescription: 'AI consulting for recruitment agencies and talent teams. Improve sourcing, screening, CRM hygiene, shortlists, client updates, and candidate communication.',
        image: '/assets/home-recruitment-consulting.webp',
        socialImage: '/assets/social/recruitment-ai-consulting.jpg',
        heroLabel: 'Recruitment AI consulting',
        imageAlt: 'Recruitment consultants reviewing candidate and client workflows',
        headline: 'Help consultants place the right people faster.',
        subhead: 'We build AI systems that improve sourcing, screening, CRM quality, shortlist preparation, and client communication while keeping recruiter judgement in control.',
        artTitle: 'More consultant capacity for candidates and clients.',
        artText: 'Automate repeated coordination and administration without turning recruitment into an impersonal process.',
        metrics: ['Faster shortlist preparation', 'Cleaner CRM data', 'Consultant approval retained'],
        journeyKicker: 'Recruitment outcomes',
        journeyHeadline: 'Increase delivery speed without weakening relationships.',
        journeyCopy: 'We reduce the repeated work around every assignment so consultants can spend more time understanding candidates, advising clients, and closing placements.',
        journeyCards: [
            { label: 'Consultant capacity', title: 'Spend more time on valuable conversations.', text: 'Reduce repeated searches, note formatting, CRM updates, scheduling, and status chasing across active assignments.' },
            { label: 'Delivery quality', title: 'Build stronger shortlists with clearer evidence.', text: 'Structure candidate information, compare approved criteria, surface relevant experience, and keep final selection with consultants.' },
            { label: 'Candidate trust', title: 'Keep communication timely and human.', text: 'Prepare updates and reminders with tone controls, consent boundaries, consultant approval, and clear escalation. We can sign an NDA before discovery.' },
        ],
        focusHeadline: 'AI built around the recruitment lifecycle.',
        focusCopy: 'From business development and sourcing to screening, interviews, placement, and follow-up, we design around your consultants, specialisms, and existing systems.',
        focusLabel: 'Where we can help',
        focusTitle: 'Improve the workflows behind every successful placement.',
        useCases: [
            { title: 'Candidate sourcing and rediscovery', text: 'Search existing talent pools, structure profiles, surface relevant candidates, and help consultants rediscover overlooked relationships.' },
            { title: 'Screening and shortlist preparation', text: 'Summarise evidence against approved criteria, identify missing information, and prepare consultant-reviewed shortlist material.' },
            { title: 'ATS and CRM data quality', text: 'Clean records, standardise notes, identify duplicates, enrich approved fields, and prompt consultants when important information is missing.' },
            { title: 'Candidate communication and scheduling', text: 'Prepare personalised updates, interview reminders, availability requests, and follow-ups while preserving consultant approval and tone.' },
            { title: 'Client updates and reporting', text: 'Turn assignment activity into clear progress updates, pipeline summaries, market feedback, and review-ready client reports.' },
            { title: 'Recruitment operations and compliance', text: 'Support consent records, document checks, onboarding tasks, handoffs, and operational reporting across placements.' },
        ],
        methodHeadline: 'How we set your recruitment business up for success.',
        methodCopy: 'We identify the workflow affecting placements or consultant capacity, build around your operating model, and measure value before scaling across desks.',
        method: [
            { label: '01', title: 'Choose the commercial outcome', text: 'Define whether the priority is faster shortlists, stronger CRM data, more consultant capacity, better candidate communication, or improved client visibility.' },
            { label: '02', title: 'Design around recruiters and relationships', text: 'Map ATS and CRM data, consent, tone, consultant ownership, client expectations, and the decisions that must remain human.' },
            { label: '03', title: 'Build and test with real assignments', text: 'Validate the workflow against realistic roles, candidate profiles, edge cases, communication standards, and consultant review.' },
            { label: '04', title: 'Deploy and measure placement impact', text: 'Track time saved, data quality, response speed, shortlist preparation, adoption, and exceptions before expanding.' },
        ],
        ctaHeadline: 'Start with the recruitment workflow limiting placements or growth.',
        ctaCopy: 'Tell us where sourcing, screening, CRM quality, candidate communication, client updates, or recruitment administration are slowing your team. We will define the right first deployment.',
        ctaSecondaryLabel: 'Send a brief',
        ctaSecondaryAction: 'brief',
    },
];

const homeVariantByPath = new Map(homeVariants.map((variant) => [variant.path.split('/').pop(), variant]));
const verticalVariants = new Map([
    ['healthcare', homeVariants.find((variant) => variant.path === '/home/clinical-calm')],
    ['hospitality', homeVariants.find((variant) => variant.path === '/home/hospitality-service')],
    ['legal', homeVariants.find((variant) => variant.path === '/home/trust-ledger')],
    ['financial-services', homeVariants.find((variant) => variant.path === '/home/executive-editorial')],
    ['insurance', homeVariants.find((variant) => variant.path === '/home/insurance-controls')],
    ['recruitment', homeVariants.find((variant) => variant.path === '/home/recruitment-workflows')],
    ['manufacturing', homeVariants.find((variant) => variant.path === '/home/operator-console')],
    ['ecommerce', homeVariants.find((variant) => variant.path === '/home/human-service')],
    ['applied-ai-engineering', homeVariants.find((variant) => variant.path === '/home/applied-ai-engineering')],
    ['swe-applied-ai', homeVariants.find((variant) => variant.path === '/home/applied-ai-engineering')],
]);

app.get('/home-variants', (_req, res) => res.render('home-variants', {
    title: 'Homepage A/B Variants | Zeffron',
    description: 'Nine premium homepage design variants for Zeffron A/B testing.',
    canonical: 'https://zeffron.ai/home-variants',
    activeNav: 'home',
    noindex: true,
    bodyClass: 'home-variants-page',
    variants: homeVariants,
}));

app.get('/home/:variant', (req, res, next) => {
    const variant = homeVariantByPath.get(req.params.variant);
    if (!variant) return next();
    return res.render('home-variant', {
        title: variant.seoTitle || `${variant.name} Homepage Variant | Zeffron`,
        description: variant.seoDescription || `${variant.name} homepage variant for Zeffron secure AI consulting A/B testing.`,
        canonical: `https://zeffron.ai${variant.path}`,
        activeNav: 'home',
        noindex: !variant.seoTitle,
        ogImage: `https://zeffron.ai${variant.socialImage || variant.image}`,
        ogImageType: variant.socialImage ? 'image/jpeg' : (variant.image.endsWith('.png') ? 'image/png' : 'image/webp'),
        ogImageWidth: variant.socialImage ? 1200 : undefined,
        ogImageHeight: variant.socialImage ? 630 : undefined,
        ogImageAlt: variant.imageAlt || `${variant.vertical.name} AI consulting by Zeffron`,
        bodyClass: `home-ab-page ${variant.bodyClass}`,
        variant,
        shared: sharedHomeVariantContent,
    });
});

app.get('/verticals/:vertical', (req, res, next) => {
    const variant = verticalVariants.get(req.params.vertical);
    if (!variant) return next();
    return res.redirect(301, variant.path);
});

// --- Migrated pages (rendered through the shared layout) -------------------
app.get(['/career', '/careers'], (_req, res) => res.render('career', {
    title: 'Careers at Zeffron — AI & Software Engineering Jobs in the UK',
    description: 'Join Zeffron — a UK product and AI studio for regulated service teams. Roles in AI engineering, full-stack development, design, and product. Remote-first, output over hours.',
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

app.get('/playbook', (_req, res) => res.redirect(301, '/research'));

app.get('/legacy-playbook', (_req, res) => res.redirect(301, '/research'));

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
        slug: 'building-rag-is-the-easy-60',
        postTitle: "RAG Is the Easy 60%. Here's the Other 40%.",
        seoTitle: "RAG Is the Easy 60%. Here's the Other 40%. | Zeffron Blog",
        description: 'Most production RAG systems fail not because of the visible stack, but because of four invisible systems: eval harnesses, freshness pipelines, fallback policies, and query rewriting.',
        excerpt: 'Eval harnesses, freshness pipelines, fallback policies, and query rewriting are the four invisible systems that separate a RAG demo from a RAG product.',
        listingExcerpt: 'Most production RAG systems fail not because of the visible stack, but because of four invisible systems: eval harnesses, freshness pipelines, fallback policies, and query rewriting.',
        keywords: 'RAG, retrieval augmented generation, eval harnesses, query rewriting, fallback policies, AI product engineering, Zeffron AI',
        category: 'Engineering',
        date: 'May 15, 2026',
        listingDate: 'May 15, 2026',
        datePublished: '2026-05-15',
        readTime: '10 min read',
        image: '/assets/rag_is_easy.jpeg',
        imageAlt: "RAG Is the Easy 60%. Here's the Other 40%.",
        imageGradient: 'from-[#0145F2]/20 to-[#977DFF]/20',
        imageBg: 'bg-[#111]',
        imageFit: 'object-cover',
        imageOpacity: 'opacity-90',
    },
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
    '/assets/rag_is_easy.jpeg': '/assets/rag_is_easy.jpeg',
}[image] || image);

const imageTypeFor = (image) => {
    if (/\.png$/i.test(image)) return 'image/png';
    if (/\.webp$/i.test(image)) return 'image/webp';
    return 'image/jpeg';
};

const imageMetaFor = (image) => ({
    '/assets/ai-adoption.jpeg': { width: 1200, height: 800 },
    '/assets/blog-custom-ai.jpeg': { width: 1200, height: 800 },
    '/assets/blog-ai-compromise.jpeg': { width: 1200, height: 800 },
    '/assets/blog-5-signs-hero.jpg': { width: 1200, height: 800 },
    '/assets/let-users-build-doc-image.png': { width: 1200, height: 630 },
    '/assets/whatsapp.png': { width: 1200, height: 630 },
    '/assets/rag_is_easy.jpeg': { width: 1920, height: 1080 },
}[image] || { width: 1200, height: 630 });

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
    description: 'Insights, guides, and stories from Zeffron on secure AI adoption, automation, governance, and software engineering.',
    keywords: 'AI governance blog, secure AI adoption, AI engineering UK, software engineering blog, Zeffron blog, AI automation insights',
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
            description: 'Insights on secure AI adoption, automation, governance, and software engineering.',
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
    const ogImageMeta = imageMetaFor(socialImage);
    const shareTitleEncoded = encodeURIComponent(post.postTitle);

    app.get(`/blog/${post.slug}`, (_req, res) => res.render(`blog/${post.slug}`, {
        title: post.seoTitle,
        description: post.description,
        keywords: post.keywords,
        canonical,
        bodyClass: 'blog-post-page',
        activeNav: 'blog',
        ogType: 'article',
        ogImage: absoluteImage,
        ogImageType,
        ogImageWidth: ogImageMeta.width,
        ogImageHeight: ogImageMeta.height,
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
