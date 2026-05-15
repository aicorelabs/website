// Postgres pool + table bootstrap.
// On Railway, DATABASE_URL is injected automatically when a Postgres plugin
// is attached. Locally, set it in .env. SSL is enabled in production because
// the managed instance terminates TLS at the connection.

const { Pool } = require('pg');

// Pool config tuned for a small single-instance deploy on Railway.
// - `max: 10` keeps us well under Railway Postgres's connection cap.
// - `connectionTimeoutMillis: 5000` fails fast when the DB is unreachable
//   (default is 0 = no timeout, which would hang the boot healthcheck).
// - `idleTimeoutMillis: 30000` lets idle clients release back to the pool.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: Number(process.env.PG_POOL_MAX) || 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
    console.error('[db] unexpected pool error:', err.message);
});

// Hardcoded seed lifted from the original jira.html — keeps the board
// usable on first boot before anyone creates real tickets.
const SEED_TASKS = [
    { id: 'NC-101', title: 'PostHog Implementation', tag: 'Analytics', status: 'todo', duration: '3 Days', description: 'Complete integration of PostHog analytics.<br><br><strong>Deliverables:</strong><ul><li>Session Recordings & Heatmaps</li><li>Conversion Funnels & Surveys</li><li>Feature Flags & Event Tracking</li><li>User Paths & Autocapture</li></ul>' },
    { id: 'NC-102', title: 'Analytics Dashboard Setup', tag: 'Analytics', status: 'todo', duration: '1 Day', description: 'Consolidation of key metrics into a single view.<br>Custom report configuration for stakeholder access.' },
    { id: 'NC-201', title: 'User Behavior Analysis', tag: 'Strategy', status: 'todo', duration: '1 Day', description: 'Analysis of collected data from Phase 1.<br><br><strong>Deliverables:</strong><ul><li>Identification of user behaviour trends</li><li>Drop-off point analysis</li><li>User journey mapping</li></ul>' },
    { id: 'NC-301', title: 'Technical SEO Enhancements', tag: 'SEO', status: 'todo', duration: '2 Days', description: '<strong>Deliverables:</strong><ul><li>Meta Tag Optimisation</li><li>Semantic HTML structure</li><li>Social media excerpt optimisation (Open Graph, Twitter Cards)</li></ul>' },
    { id: 'NC-302', title: 'Homepage Content Optimization', tag: 'SEO', status: 'todo', duration: '1 Day', description: '<strong>Deliverables:</strong><ul><li>SERP-optimised homepage content</li><li>Clear value proposition and messaging</li><li>Improved call-to-action placement</li></ul>' },
    { id: 'NC-303', title: 'Most Popular Dynamic Section', tag: 'SEO', status: 'todo', duration: '1 Day', description: 'Dynamic "Most Popular" content section based on analytics from PostHog data.' },
    { id: 'NC-304', title: 'Multi-Audience Marketing Pages', tag: 'SEO', status: 'todo', duration: '3 Days', description: 'Development of targeted landing pages for:<br><ul><li>Students & Patients</li><li>Healthcare professionals</li><li>Lecturers and educators</li><li>Organisations and institutions</li></ul>' },
    { id: 'NC-401', title: 'Blog/Podcast Transformation', tag: 'Content', status: 'todo', duration: '1 Week', description: '<strong>Deliverables:</strong><ul><li>Rename "Podcast" to "Blog"</li><li>Enhanced meta tags/descriptions</li><li>Image optimisation & accessibility</li><li>Improved layout & typography</li></ul>' },
    { id: 'NC-501', title: 'Graph RAG Implementation', tag: 'AI', status: 'todo', duration: '1.5 Weeks', description: 'AI chatbot interface for user queries.<br><br><strong>Deliverables:</strong><ul><li>Integration with existing platform data</li><li>NLP for medical/clinical content</li><li>Conversational interface</li></ul>' },
    { id: 'NC-502', title: 'Knowledge Base Integration', tag: 'AI', status: 'todo', duration: '3 Days', description: '<strong>Deliverables:</strong><ul><li>Connection to checklists, protocols, content</li><li>Contextual retrieval</li><li>Citation and source tracking</li></ul>' },
    { id: 'NC-503', title: 'User Testing & Refinement', tag: 'AI', status: 'todo', duration: '2 Days', description: '<strong>Deliverables:</strong><ul><li>Beta testing with select groups</li><li>Response accuracy validation</li><li>Interface optimisation</li></ul>' },
];

// Idempotent: safe to call on every boot. Creates the table if missing and
// seeds the initial backlog the first time only.
const init = async () => {
    if (!process.env.DATABASE_URL) {
        console.warn('[db] DATABASE_URL not set — skipping pg init (jira API will 500 until configured)');
        return;
    }

    await pool.query(`
        CREATE TABLE IF NOT EXISTS jira_tasks (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL,
            tag         TEXT NOT NULL,
            status      TEXT NOT NULL CHECK (status IN ('todo', 'progress', 'review', 'done')),
            duration    TEXT,
            description TEXT,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS jira_tasks_status_idx ON jira_tasks (status, sort_order)`);

    // Brief submissions — one row per scoping-form submission. The branched
    // fields (project_* vs existing_*) are nullable since only one set is
    // populated per row, depending on `mode`. `files` is JSONB so the
    // Cloudinary metadata round-trips intact without a join table.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS brief_submissions (
            id                    TEXT PRIMARY KEY,
            received_at           TIMESTAMPTZ NOT NULL,
            mode                  TEXT NOT NULL CHECK (mode IN ('new', 'existing')),
            name                  TEXT NOT NULL,
            email                 TEXT NOT NULL,
            company               TEXT,
            project_description   TEXT,
            project_type          TEXT,
            existing_description  TEXT,
            help_type             TEXT,
            staging_url           TEXT,
            files                 JSONB NOT NULL DEFAULT '[]'::jsonb,
            marketing_opt_in      BOOLEAN NOT NULL DEFAULT FALSE,
            ip                    TEXT,
            user_agent            TEXT,
            created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS brief_submissions_email_idx ON brief_submissions (email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS brief_submissions_received_idx ON brief_submissions (received_at DESC)`);

    // Playbook leads — one row per playbook landing-page form submission.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS playbook_leads (
            id           TEXT PRIMARY KEY,
            received_at  TIMESTAMPTZ NOT NULL,
            name         TEXT NOT NULL,
            email        TEXT NOT NULL,
            role         TEXT NOT NULL,
            stage        TEXT NOT NULL,
            source       TEXT NOT NULL DEFAULT 'playbook-landing',
            ip           TEXT,
            user_agent   TEXT,
            referer      TEXT,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS playbook_leads_email_idx ON playbook_leads (email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS playbook_leads_received_idx ON playbook_leads (received_at DESC)`);

    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM jira_tasks`);
    if (rows[0].n === 0) {
        console.log('[db] seeding jira_tasks with initial backlog…');
        for (let i = 0; i < SEED_TASKS.length; i++) {
            const t = SEED_TASKS[i];
            await pool.query(
                `INSERT INTO jira_tasks (id, title, tag, status, duration, description, sort_order)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [t.id, t.title, t.tag, t.status, t.duration, t.description, i]
            );
        }
    }
    console.log('[db] jira_tasks ready');
};

// Called from the SIGTERM/SIGINT handler to drain the pool cleanly on redeploy.
const close = async () => {
    try { await pool.end(); }
    catch (err) { console.error('[db] pool drain error:', err.message); }
};

// Persist one brief submission. No-op (logs a warning) when DATABASE_URL is
// missing so local dev keeps working. Callers should treat the returned
// promise as fire-and-forget and never block the HTTP response on the result.
const insertBrief = async (s) => {
    if (!process.env.DATABASE_URL) {
        console.warn('[db] DATABASE_URL not set — skipping brief persistence');
        return { skipped: true };
    }
    const isNew = s.mode === 'new';
    await pool.query(
        `INSERT INTO brief_submissions (
            id, received_at, mode, name, email, company,
            project_description, project_type,
            existing_description, help_type, staging_url,
            files, marketing_opt_in, ip, user_agent
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15)
         ON CONFLICT (id) DO NOTHING`,
        [
            s.id,
            s.receivedAt,
            s.mode,
            s.contact.name,
            s.contact.email,
            s.contact.company || null,
            isNew ? s.details.project_description : null,
            isNew ? s.details.project_type        : null,
            isNew ? null : s.details.existing_description,
            isNew ? null : s.details.help_type,
            isNew ? null : s.details.staging_url,
            JSON.stringify(s.files || []),
            !!s.marketingOptIn,
            s.meta?.ip || null,
            s.meta?.userAgent || null,
        ]
    );
    return { ok: true };
};

// Persist one playbook lead. Same fire-and-forget contract as insertBrief.
const insertPlaybookLead = async (s) => {
    if (!process.env.DATABASE_URL) {
        console.warn('[db] DATABASE_URL not set — skipping playbook persistence');
        return { skipped: true };
    }
    await pool.query(
        `INSERT INTO playbook_leads (
            id, received_at, name, email, role, stage,
            source, ip, user_agent, referer
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO NOTHING`,
        [
            s.id,
            s.receivedAt,
            s.lead.name,
            s.lead.email,
            s.lead.role,
            s.lead.stage,
            s.source || 'playbook-landing',
            s.meta?.ip || null,
            s.meta?.userAgent || null,
            s.meta?.referer || null,
        ]
    );
    return { ok: true };
};

// Admin read helpers — pull recent submissions for the /admin views. Empty
// arrays + zero counts when DATABASE_URL is missing so the page still renders
// in a misconfigured environment instead of 500ing.
const listBriefs = async (limit = 500) => {
    if (!process.env.DATABASE_URL) return [];
    const { rows } = await pool.query(
        `SELECT id, received_at, mode, name, email, company,
                project_description, project_type,
                existing_description, help_type, staging_url,
                files, marketing_opt_in, ip, user_agent
         FROM brief_submissions
         ORDER BY received_at DESC
         LIMIT $1`,
        [limit]
    );
    return rows;
};

const listPlaybookLeads = async (limit = 500) => {
    if (!process.env.DATABASE_URL) return [];
    const { rows } = await pool.query(
        `SELECT id, received_at, name, email, role, stage, source, ip, referer
         FROM playbook_leads
         ORDER BY received_at DESC
         LIMIT $1`,
        [limit]
    );
    return rows;
};

const countSubmissions = async () => {
    if (!process.env.DATABASE_URL) return { briefs: 0, leads: 0 };
    const [a, b] = await Promise.all([
        pool.query('SELECT COUNT(*)::int n FROM brief_submissions'),
        pool.query('SELECT COUNT(*)::int n FROM playbook_leads'),
    ]);
    return { briefs: a.rows[0].n, leads: b.rows[0].n };
};

module.exports = {
    pool, init, close,
    insertBrief, insertPlaybookLead,
    listBriefs, listPlaybookLeads, countSubmissions,
};
