// POST /api/playbook — lead capture for The Founder's AI Prompt Playbook.
// Validates the four fields, logs the submission to the console (audit trail),
// and returns JSON. Email delivery of the playbook itself is intentionally
// left as a separate concern — wire it up via Resend / Postmark / a queue
// when the asset is finalised. See the TODO below.

const express = require('express');

const { sendPlaybookNotification, sendPlaybookToLead } = require('./email');
const { insertPlaybookLead } = require('../db');

const router = express.Router();

const ROLES  = new Set(['Solo founder', 'Startup team', 'SME owner', 'Other']);
const STAGES = new Set(['Just an idea', 'Validating', 'Ready to build', 'Already building']);

const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

router.post('/', (req, res) => {
    const body = req.body || {};
    const name  = typeof body.name  === 'string' ? body.name.trim()  : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const role  = typeof body.role  === 'string' ? body.role.trim()  : '';
    const stage = typeof body.stage === 'string' ? body.stage.trim() : '';

    const missing = [];
    if (!name)            missing.push('name');
    if (!isEmail(email))  missing.push('email');
    if (!ROLES.has(role)) missing.push('role');
    if (!STAGES.has(stage)) missing.push('stage');

    if (missing.length) {
        return res.status(400).json({ ok: false, error: 'Missing or invalid fields', missing });
    }

    const submission = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        receivedAt: new Date().toISOString(),
        lead: { name, email, role, stage },
        source: 'playbook-landing',
        meta: {
            ip: req.ip,
            userAgent: req.get('user-agent') || null,
            referer: req.get('referer') || null,
        },
    };

    console.log('\n[playbook] new lead ────────────────────────');
    console.log(JSON.stringify(submission, null, 2));
    console.log('────────────────────────────────────────────\n');

    // Fire-and-forget persistence. Same contract as briefs: DB outage never
    // fails the user-facing response.
    insertPlaybookLead(submission).catch((err) => {
        console.error('[playbook] db persist failed (non-fatal):', err?.message || err);
    });

    // Fire-and-forget team notification. Same pattern as briefs: the user's
    // response is never blocked or failed by an email problem.
    sendPlaybookNotification(submission).catch((err) => {
        console.error('[playbook] notification failed (non-fatal):', err?.message || err);
    });

    // Deliver the PDF to the lead. Fire-and-forget; the thanks card on the
    // page already shows an instant download link, so the email is a backup.
    sendPlaybookToLead(submission).catch((err) => {
        console.error('[playbook] delivery to lead failed (non-fatal):', err?.message || err);
    });

    res.status(201).json({ ok: true, id: submission.id });
});

module.exports = router;
