// POST /api/brief — receives the scoping form (toggle, common fields,
// branched fields, file uploads, consent flags). Validates input, persists
// upload metadata, and returns JSON. The actual email send is stubbed for
// now — see the TODO at the bottom for where to plug in Resend / Postmark /
// SendGrid / a queue / etc.

const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');

const { sendBriefNotification } = require('./email');

const router = express.Router();
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Make sure the upload dir exists at boot. Failing silently here would mean
// every submission errors at write time; better to crash early on a bad setup.
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
        const safe = file.originalname.replace(/[^a-z0-9.\-_]/gi, '_');
        cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`);
    },
});

const upload = multer({
    storage,
    limits: {
        fileSize: 25 * 1024 * 1024, // 25 MB per file (matches the dropzone hint)
        files: 10,
    },
    fileFilter: (_req, file, cb) => {
        // Allow common doc/image/deck types. Reject executables and the like.
        const allowed = /\.(pdf|docx?|xlsx?|pptx?|key|pages|numbers|png|jpe?g|gif|webp|svg|md|txt|csv|fig|sketch|zip)$/i;
        if (!allowed.test(file.originalname)) {
            return cb(new Error(`File type not allowed: ${file.originalname}`));
        }
        cb(null, true);
    },
});

// Required fields per branch — keeps the source of truth on the server, not
// only on the client (which can be bypassed).
const REQUIRED = {
    common: ['name', 'email'],
    new:    ['project_description', 'project_type'],
    existing: ['existing_description'],
};

const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

router.post('/', upload.array('files', 10), (req, res) => {
    const body = req.body || {};
    const mode = body.brief_mode === 'existing' ? 'existing' : 'new';

    // Validate
    const missing = [];
    for (const key of REQUIRED.common) if (!body[key] || !String(body[key]).trim()) missing.push(key);
    for (const key of REQUIRED[mode])  if (!body[key] || !String(body[key]).trim()) missing.push(key);
    if (!isEmail(body.email)) missing.push('email (invalid format)');
    if (body.consent_terms !== 'on' && body.consent_terms !== 'true' && body.consent_terms !== true) {
        missing.push('consent_terms');
    }

    if (missing.length) {
        // Clean up any uploads we just accepted so we don't leak storage
        for (const f of req.files || []) {
            try { fs.unlinkSync(f.path); } catch (_) { /* ignore */ }
        }
        return res.status(400).json({ ok: false, error: 'Missing or invalid fields', missing });
    }

    const submission = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        receivedAt: new Date().toISOString(),
        mode,
        contact: {
            name: body.name,
            email: body.email,
            company: body.company || null,
        },
        details: mode === 'new'
            ? {
                project_description: body.project_description,
                project_type: body.project_type,
            }
            : {
                existing_description: body.existing_description,
                help_type: body.help_type || null,
                staging_url: body.staging_url || null,
            },
        files: (req.files || []).map((f) => ({
            originalName: f.originalname,
            storedAs: f.filename,
            size: f.size,
            mime: f.mimetype,
        })),
        marketingOptIn: body.consent_marketing === 'on' || body.consent_marketing === 'true',
        meta: {
            ip: req.ip,
            userAgent: req.get('user-agent') || null,
        },
    };

    // Visible audit log so the dev can see incoming briefs in the terminal.
    console.log('\n[brief] new submission ─────────────────────');
    console.log(JSON.stringify(submission, null, 2));
    console.log('────────────────────────────────────────────\n');

    // Fire-and-forget team notification via Resend. The user's response is
    // never blocked or failed by an email problem — failures are logged.
    sendBriefNotification(submission, req.files).catch((err) => {
        console.error('[brief] notification failed (non-fatal):', err?.message || err);
    });

    // ▶ TODO — customer-facing follow-up template (separate from above).
    // See api/email.js bottom for the spec from content.txt lines 187–249.

    res.status(201).json({ ok: true, id: submission.id });
});

// Surface multer errors (file too large, too many files, bad type) as JSON
// rather than HTML so the client's fetch handler can show a useful message.
router.use((err, _req, res, _next) => {
    if (err) {
        const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({ ok: false, error: err.message || String(err) });
    }
});

module.exports = router;
