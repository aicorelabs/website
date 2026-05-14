// Zeffron — Express server
// Serves the existing static HTML pages, the public/ asset bundle (shared CSS/JS),
// and the /api/* routes (form submissions, etc.).

require('dotenv').config(); // loads .env if present; no-op in production hosts that inject env vars directly

const path = require('path');
const express = require('express');
const { engine } = require('express-handlebars');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

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
const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Zeffron',
    legalName: 'Zeffron Systems',
    image: 'https://zeffron.ai/assets/PNG/Logo%20-%20White@2x.png',
    logo: 'https://zeffron.ai/assets/PNG/Logo%20-%20White@2x.png',
    '@id': 'https://zeffron.ai',
    url: 'https://zeffron.ai',
    telephone: '+441215550123',
    email: 'hello@zeffron.ai',
    address: { '@type': 'PostalAddress', addressLocality: 'London', addressRegion: 'England', addressCountry: 'GB' },
    areaServed: { '@type': 'Country', name: 'United Kingdom' },
    sameAs: [
        'https://www.linkedin.com/company/zeffron-ai/',
        'https://x.com/zeffron_ai',
        'https://www.instagram.com/zeffron_ai_',
    ],
};

// Homepage SEO + structured data shared across all "homepage" routes
const homeLocals = {
    title: 'Zeffron — AI & MVP Development for Founders | UK',
    description: 'Zeffron builds investor-ready AI products and MVPs in 10 days. A UK product and AI studio for founders moving fast. Book a free discovery call today.',
    keywords: 'AI development UK, MVP development, custom AI agency, AI product studio, AI engineering UK, fractional CTO UK, investor-ready MVP',
    canonical: 'https://zeffron.ai/',
    activeNav: 'home',
    ogImage: 'https://zeffron.ai/assets/iphone-16-pro-mockup-v2.jpg',
    ogImageAlt: 'Zeffron — AI & MVP Development Studio for Founders',
    jsonLd: [
        organization,
        {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Zeffron',
            url: 'https://zeffron.ai/',
            publisher: { '@id': 'https://zeffron.ai' },
            inLanguage: 'en-GB',
        },
        {
            '@context': 'https://schema.org',
            '@type': 'ProfessionalService',
            name: 'Zeffron',
            url: 'https://zeffron.ai/',
            image: 'https://zeffron.ai/assets/iphone-16-pro-mockup-v2.jpg',
            priceRange: '££££',
            address: { '@type': 'PostalAddress', addressLocality: 'London', addressRegion: 'England', addressCountry: 'GB' },
            areaServed: { '@type': 'Country', name: 'United Kingdom' },
            serviceType: ['Custom AI development', 'MVP development', 'Product engineering', 'Fractional CTO'],
        },
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

// --- Standalone tool pages (not in shared layout) --------------------------
// jira.html and n8n_org.html have their own full-screen designs and are
// served as static .html. blog.html is still pre-migration and uses the old
// chrome.
const standalonePages = {
    '/jira': 'jira.html',
    '/n8n': 'n8n_org.html',
    '/blog': 'blog.html',
};
for (const [route, file] of Object.entries(standalonePages)) {
    app.get(route, (_req, res) => res.sendFile(path.join(ROOT, file)));
}

// --- Static asset mounts ----------------------------------------------------
//   /css/*, /js/*       → public/  (shared design system, scripts)
//   /assets/*           → assets/  (logo, images, icons — existing tree)
//   /blog/*             → blog/    (individual blog post files)
//   /                   → repo root (so .html, robots.txt, sitemap.xml still resolve)
app.use(express.static(path.join(ROOT, 'public'), { maxAge: '1h', extensions: ['html'] }));
app.use('/assets', express.static(path.join(ROOT, 'assets'), { maxAge: '7d' }));
app.use('/blog', express.static(path.join(ROOT, 'blog'), { extensions: ['html'], redirect: false }));

// --- API routes -------------------------------------------------------------
app.use('/api/brief', require('./api/brief'));

// Health check (handy for deploy targets like Render / Fly / Railway)
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// --- Static fallback for every other .html / file at repo root --------------
app.use(express.static(ROOT, { extensions: ['html'], maxAge: '1h' }));

// --- 404 --------------------------------------------------------------------
app.use((_req, res) => res.status(404).render('home', homeLocals));

app.listen(PORT, () => {
    console.log(`Zeffron server running → http://localhost:${PORT}`);
});
