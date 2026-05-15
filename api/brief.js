// POST /api/brief — receives the scoping form (toggle, common fields,
// branched fields, file uploads, consent flags). Validates input, streams
// uploads to Cloudinary, and returns JSON. The team-notification email is
// fire-and-forget via Resend (see api/email.js).

const express = require('express');
const multer = require('multer');

const { sendBriefNotification } = require('./email');
const { uploadBuffer, isConfigured: cloudinaryConfigured } = require('./cloudinary');
const { insertBrief } = require('../db');

const router = express.Router();

// In-memory storage — files never touch disk. Each file is uploaded to
// Cloudinary immediately after multer parses the multipart body. 25 MB per
// file matches the dropzone hint on the brief form.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 25 * 1024 * 1024,
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

router.post('/', upload.array('files', 10), async (req, res) => {
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
        return res.status(400).json({ ok: false, error: 'Missing or invalid fields', missing });
    }

    // Push every uploaded buffer to Cloudinary in parallel before we build
    // the submission record. If Cloudinary isn't configured we 503 — the
    // form has no graceful local fallback now that disk storage is gone.
    const incoming = req.files || [];
    let uploaded = [];
    if (incoming.length) {
        if (!cloudinaryConfigured()) {
            return res.status(503).json({
                ok: false,
                error: 'File uploads unavailable: Cloudinary credentials not configured on the server.',
            });
        }
        try {
            uploaded = await Promise.all(
                incoming.map(async (f) => {
                    const result = await uploadBuffer(f.buffer, f.originalname);
                    return {
                        originalName: f.originalname,
                        url: result.url,
                        publicId: result.publicId,
                        size: f.size,
                        mime: f.mimetype,
                        resourceType: result.resourceType,
                    };
                })
            );
        } catch (err) {
            console.error('[brief] cloudinary upload failed:', err?.message || err);
            return res.status(502).json({ ok: false, error: 'File upload failed. Please try again.' });
        }
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
        files: uploaded,
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

    // Fire-and-forget persistence. The user's response is never blocked or
    // failed by a DB problem — failures are logged. Same contract as the
    // email send below.
    insertBrief(submission).catch((err) => {
        console.error('[brief] db persist failed (non-fatal):', err?.message || err);
    });

    // Fire-and-forget team notification via Resend. The user's response is
    // never blocked or failed by an email problem — failures are logged.
    // Pass the multer file objects so the email layer can attach the raw
    // buffers (Cloudinary URLs are also in submission.files for linking).
    sendBriefNotification(submission, incoming).catch((err) => {
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
