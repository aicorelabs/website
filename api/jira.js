// /api/jira — Postgres-backed kanban API.
//
//   GET    /api/jira/tasks          → list all tasks (sorted by status + position)
//   POST   /api/jira/tasks          → create a new task
//   PATCH  /api/jira/tasks/:id      → partial update (status, title, tag, etc.)
//   DELETE /api/jira/tasks/:id      → remove a task
//
// All writes update `updated_at`. The board client uses optimistic UI and
// trusts the API to be the source of truth on reload.

const express = require('express');
const { pool } = require('../db');

const router = express.Router();

const STATUSES = new Set(['todo', 'progress', 'review', 'done']);
const TAGS = new Set(['Analytics', 'Strategy', 'SEO', 'Content', 'AI', 'Dev']);

const requirePg = (_req, res, next) => {
    if (!process.env.DATABASE_URL) {
        return res.status(503).json({ ok: false, error: 'Database not configured (DATABASE_URL missing)' });
    }
    next();
};

router.use(requirePg);

router.get('/tasks', async (_req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, title, tag, status, duration, description, sort_order
               FROM jira_tasks
              ORDER BY status, sort_order, id`
        );
        res.json({ ok: true, tasks: rows });
    } catch (err) {
        console.error('[jira] list failed:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.post('/tasks', async (req, res) => {
    const b = req.body || {};
    if (!b.id || !b.title || !b.tag || !b.status) {
        return res.status(400).json({ ok: false, error: 'id, title, tag and status are required' });
    }
    if (!STATUSES.has(b.status)) {
        return res.status(400).json({ ok: false, error: `status must be one of ${[...STATUSES].join(', ')}` });
    }

    try {
        const { rows } = await pool.query(
            `INSERT INTO jira_tasks (id, title, tag, status, duration, description, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6,
                     COALESCE((SELECT MAX(sort_order) + 1 FROM jira_tasks WHERE status = $4), 0))
             RETURNING id, title, tag, status, duration, description, sort_order`,
            [b.id, b.title, b.tag, b.status, b.duration || null, b.description || null]
        );
        res.status(201).json({ ok: true, task: rows[0] });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ ok: false, error: `Task ${b.id} already exists` });
        console.error('[jira] create failed:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.patch('/tasks/:id', async (req, res) => {
    const id = req.params.id;
    const b = req.body || {};

    const sets = [];
    const vals = [];
    let i = 1;
    const setField = (col, val) => { sets.push(`${col} = $${i++}`); vals.push(val); };

    if (b.status !== undefined) {
        if (!STATUSES.has(b.status)) {
            return res.status(400).json({ ok: false, error: `status must be one of ${[...STATUSES].join(', ')}` });
        }
        setField('status', b.status);
    }
    if (b.title !== undefined) setField('title', String(b.title));
    if (b.tag !== undefined) setField('tag', String(b.tag));
    if (b.duration !== undefined) setField('duration', b.duration || null);
    if (b.description !== undefined) setField('description', b.description || null);
    if (b.sort_order !== undefined) setField('sort_order', Number(b.sort_order));

    if (!sets.length) {
        return res.status(400).json({ ok: false, error: 'No updatable fields supplied' });
    }
    setField('updated_at', new Date());
    vals.push(id);

    try {
        const { rows } = await pool.query(
            `UPDATE jira_tasks SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, title, tag, status, duration, description, sort_order`,
            vals
        );
        if (!rows.length) return res.status(404).json({ ok: false, error: 'Task not found' });
        res.json({ ok: true, task: rows[0] });
    } catch (err) {
        console.error('[jira] update failed:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.delete('/tasks/:id', async (req, res) => {
    try {
        const { rowCount } = await pool.query(`DELETE FROM jira_tasks WHERE id = $1`, [req.params.id]);
        if (!rowCount) return res.status(404).json({ ok: false, error: 'Task not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('[jira] delete failed:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
