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

module.exports = { pool, init, close };
