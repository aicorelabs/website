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
            text: 'Patient intake, clinical admin, referrals, scheduling, policy search, and reviewed communication.',
        },
        workflowTitle: 'Healthcare workflow stack.',
        workflowIntro: 'Healthcare pages need trust first, then recognisable systems around records, interoperability, operations, and secure AI deployment.',
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
        image: '/assets/home-healthcare-consulting.webp',
        heroLabel: 'Healthcare AI consulting',
        headline: 'Bring AI into healthcare workflows without breaking trust.',
        subhead: 'A calm route from patient admin and document drag to measured, reviewed AI deployment.',
        artTitle: 'Built for clinical teams that cannot lose trust.',
        artText: 'Human review, privacy boundaries, and clear ownership stay visible throughout the work.',
        metrics: ['Patient-ready controls', 'Clinical admin clarity', 'Measured release'],
    },
    {
        key: 'v3',
        path: '/home/executive-editorial',
        name: 'Executive Editorial',
        layout: 'editorial',
        vertical: {
            name: 'Financial services',
            shortName: 'Finance',
            href: '/home/executive-editorial',
            text: 'Client onboarding, reporting, risk review, reconciliation, data quality, and analyst workflow automation.',
        },
        workflowTitle: 'Financial services workflow stack.',
        workflowIntro: 'This variant tests a board-level page where the stack signals CRM, payments, data, analytics, and AI governance.',
        workflowStack: [
            { name: 'Salesforce', logo: workflowLogo('salesforce.com'), alt: 'Salesforce logo', role: 'Client CRM' },
            { name: 'Stripe', logo: workflowLogo('stripe.com'), alt: 'Stripe logo', role: 'Payments' },
            { name: 'Plaid', logo: workflowLogo('plaid.com'), alt: 'Plaid logo', role: 'Bank data' },
            { name: 'Xero', logo: workflowLogo('xero.com'), alt: 'Xero logo', role: 'Accounting data' },
            { name: 'QuickBooks', logo: workflowLogo('quickbooks.intuit.com'), alt: 'QuickBooks logo', role: 'SME finance' },
            { name: 'Snowflake', logo: workflowLogo('snowflake.com'), alt: 'Snowflake logo', role: 'Data warehouse' },
            { name: 'Databricks', logo: workflowLogo('databricks.com'), alt: 'Databricks logo', role: 'Data science' },
            { name: 'OpenAI', logo: 'https://cdn.simpleicons.org/openai/111111', alt: 'OpenAI logo', role: 'AI layer' },
        ],
        mood: 'Boardroom editorial, cinematic confidence, premium consulting authority.',
        sourceIdea: 'High-contrast editorial hierarchy, restrained brand blue, human operations photography.',
        bodyClass: 'variant-editorial',
        image: '/assets/home-financial-consulting.webp',
        heroLabel: 'Financial services AI advisory',
        headline: 'AI adoption for finance operators who need proof.',
        subhead: 'We turn onboarding, reporting, reconciliation, and data friction into secure assistants and measured workflows.',
        artTitle: 'A senior operating model before the build.',
        artText: 'The page leads with business cost, control, and proof before the model stack.',
        metrics: ['Cost visible', 'Controls designed', 'Impact measured'],
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
            text: 'Production planning, maintenance logs, quality reporting, supply chain exceptions, and factory knowledge systems.',
        },
        workflowTitle: 'Manufacturing workflow stack.',
        workflowIntro: 'Manufacturing buyers need the stack to feel operational: ERP, CAD, planning, data platforms, dashboards, and production AI.',
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
            'Production planning exceptions',
            'Maintenance logs',
            'Quality reporting',
            'Supplier delay triage',
            'Knowledge trapped in manuals',
        ],
        mood: 'Technical control room, stack credibility, dense but composed operational signal.',
        sourceIdea: 'Command-centre information architecture with WCAG-aware contrast and real tool logos.',
        bodyClass: 'variant-console',
        image: '/assets/home-method-consulting.webp',
        heroLabel: 'Manufacturing operations intelligence',
        headline: 'Find the factory workflow AI should remove first.',
        subhead: 'Map the bottleneck, choose the operational stack, deploy with review, and measure the result.',
        artTitle: 'From shop-floor signal to production release.',
        artText: 'Evaluation, agents, modelling, and data science stay connected to manufacturing outcomes.',
        metrics: ['Exception workflow', 'Agent boundary', 'Production metric'],
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
            name: 'SWE + Applied AI',
            shortName: 'SWE + AI',
            href: '/home/applied-ai-engineering',
            text: 'Senior SWE + applied AI delivery for mobile apps, web applications, agent workflows, integrations, evaluation, and production deployment.',
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
        firstSectionHeadline: 'The expensive part is everything around the model.',
        firstSectionCopy: 'Most AI builds fail between prototype and production: unclear user journeys, fragile integrations, missing evals, unowned edge cases, and no operational fallback. Zeffron is for teams that need senior engineering judgement before the build turns into rework.',
        terminalLines: [
            'product.scope -> mobile | web | agents',
            'backend.contract -> auth + data + integrations',
            'agent.boundary -> tools + permissions + fallbacks',
            'evals.release -> pass criteria set',
            'human.approval -> designed into flow',
            'deploy.path -> staging -> production',
        ],
        tracksHeadline: 'Mobile, web, and agent work have to be designed together.',
        tracksCopy: 'The page makes the delivery surface explicit: mobile products, web applications, and multi-agent systems connected to real users, permissions, data, and release criteria.',
        tracks: [
            { label: '01', title: 'Mobile apps', text: 'React Native and Expo apps with onboarding, auth, notifications, offline states, analytics, and AI features designed around the user journey.' },
            { label: '02', title: 'Web applications', text: 'Next.js dashboards, portals, internal tools, data workflows, payments, APIs, and production backends built around the workflows that make or save money.' },
            { label: '03', title: 'Multi-agent systems', text: 'Planner-worker agents, retrieval, tool use, approval gates, eval harnesses, observability, and release criteria so autonomous work stays bounded.' },
        ],
        workflowTitle: 'A delivery path for shippable AI software.',
        workflowIntro: 'Zeffron scopes the product, builds the software around the AI, and proves the system behaves well enough to release. The result is not an isolated experiment. It is a working application with controls, tests, and deployment discipline.',
        signalsHeadline: 'You are past the demo when these problems show up.',
        signalsCopy: 'These are the moments where applied AI needs senior software engineering beside it.',
        signals: [
            'Users need AI inside a mobile workflow, not in a separate chat box',
            'The web app needs permissions, audit trails, and a real backend',
            'Agents need tool limits, approval rules, and failure handling',
            'The prototype breaks on real data, latency, or edge cases',
            'Leadership needs release evidence before AI reaches customers',
        ],
        signalBody: 'That is the point to treat the idea as software: scope the user journey, define the data boundary, write evals, instrument failures, and ship through a controlled release path.',
        mood: 'Product engineering, applied AI systems, technical buyer confidence, startup-to-production pace.',
        sourceIdea: 'SWE + AI delivery page for product leaders, operators, and technical teams who need shipped software rather than strategy decks.',
        bodyClass: 'variant-engineering',
        image: '/assets/home-applied-ai-engineering.png',
        imageAlt: 'Product engineering system showing mobile app, web app dashboard, backend data store, and multi-agent workflow graph',
        heroLabel: 'SWE + Applied AI',
        headline: 'Ship the product. Put the AI under control.',
        subhead: 'Zeffron builds mobile apps, web apps, and agent systems where UX, backend architecture, data boundaries, evals, observability, and release are handled from the start.',
        secondaryCta: 'Explore build tracks',
        artTitle: 'From promising demo to production software.',
        artText: 'The work is not just model access or a chat interface. It is authenticated users, real data, bounded tools, approval flows, measurable quality, and a release path your team can own.',
        metrics: ['Product scope fixed', 'AI risk bounded', 'Release path defined'],
        ctaHeadline: 'Bring the AI workflow closest to revenue or cost.',
        ctaCopy: 'Book a focused consultation. We will map the users, data constraints, product surface, agent boundaries, and release path, then tell you what should be built first and what should wait.',
    },
    {
        key: 'v7',
        path: '/home/hospitality-service',
        name: 'Hospitality Service',
        layout: 'human',
        vertical: {
            name: 'Hospitality',
            shortName: 'Hospitality',
            href: '/home/hospitality-service',
            text: 'Booking enquiries, guest-service triage, staff coordination, venue operations, and live-service handoffs.',
        },
        workflowTitle: 'Hospitality workflow stack.',
        workflowIntro: 'Hospitality buyers need to see practical systems around reservations, guest messaging, CRM, staffing, payments, and safe rollout during live service.',
        workflowStack: [
            { name: 'SevenRooms', logo: workflowLogo('sevenrooms.com'), alt: 'SevenRooms logo', role: 'Reservations' },
            { name: 'OpenTable', logo: workflowLogo('opentable.com'), alt: 'OpenTable logo', role: 'Bookings' },
            { name: 'Toast', logo: workflowLogo('toasttab.com'), alt: 'Toast logo', role: 'POS' },
            { name: 'Square', logo: workflowLogo('squareup.com'), alt: 'Square logo', role: 'Payments and POS' },
            { name: 'WhatsApp', logo: 'https://cdn.simpleicons.org/whatsapp/25D366', alt: 'WhatsApp logo', role: 'Guest messaging' },
            { name: 'HubSpot', logo: workflowLogo('hubspot.com'), alt: 'HubSpot logo', role: 'CRM' },
            { name: 'Google Sheets', logo: 'https://cdn.simpleicons.org/googlesheets/34A853', alt: 'Google Sheets logo', role: 'Ops tracking' },
            { name: 'OpenAI', logo: 'https://cdn.simpleicons.org/openai/111111', alt: 'OpenAI logo', role: 'AI layer' },
        ],
        mood: 'Operational hospitality, calm service design, live-service confidence.',
        sourceIdea: 'Hospitality operations page for teams managing bookings, guest communication, and multi-site service load.',
        bodyClass: 'variant-human',
        image: '/assets/home-recruitment-consulting.webp',
        heroLabel: 'Hospitality AI consulting',
        headline: 'Reduce hospitality admin without disrupting service.',
        subhead: 'Zeffron designs AI workflows around booking enquiries, guest messaging, staff coordination, and live-service escalation.',
        artTitle: 'Built for operations that cannot pause.',
        artText: 'Start with one repeated guest or booking workflow, keep people in control, and measure response speed before wider rollout.',
        metrics: ['Guest workflow mapped', 'Fallback path set', 'Response time measured'],
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
            text: 'Quote triage, policy admin, renewals, claims support, broker-system integration, and exception handling.',
        },
        workflowTitle: 'Insurance workflow stack.',
        workflowIntro: 'Insurance buyers need evidence around broker systems, insurer portals, document handling, CRM, policy workflows, and approval controls.',
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
        image: '/assets/home-insurance-consulting.webp',
        heroLabel: 'Insurance AI consulting',
        headline: 'Automate insurance admin without losing the audit trail.',
        subhead: 'Reduce quote triage, renewal chasing, policy document handling, and broker-system rekeying with human approval built in.',
        artTitle: 'Insurance adoption, controlled from intake to approval.',
        artText: 'Every workflow needs exception handling, role-based access, and clear review before an AI output affects a customer or policy.',
        metrics: ['Quote triage scoped', 'Review queue designed', 'Audit trail visible'],
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
            text: 'Candidate screening, client updates, shortlist preparation, ATS hygiene, recruiter notes, and relationship-safe communication.',
        },
        workflowTitle: 'Recruitment workflow stack.',
        workflowIntro: 'Recruitment buyers need to recognise ATS, CRM, candidate communication, job-board, and reporting workflows before trusting AI with relationships.',
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
        image: '/assets/home-recruitment-consulting.webp',
        heroLabel: 'Recruitment AI consulting',
        headline: 'Improve recruitment workflows without flattening relationships.',
        subhead: 'Use AI to clean CRM data, prepare shortlists, draft client updates, and support consultants while keeping tone and approval under human control.',
        artTitle: 'Automation that protects the candidate relationship.',
        artText: 'The work starts with recruiter review, consent boundaries, tone controls, and the operational metrics that matter to agency leaders.',
        metrics: ['CRM hygiene improved', 'Consultant review retained', 'Client update speed measured'],
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
        title: `${variant.name} Homepage Variant | Zeffron`,
        description: `${variant.name} homepage variant for Zeffron secure AI consulting A/B testing.`,
        canonical: `https://zeffron.ai${variant.path}`,
        activeNav: 'home',
        noindex: true,
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
