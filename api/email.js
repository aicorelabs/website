// Resend wrapper + brief-notification template.
// All public exports are async; callers should treat any non-success
// outcome as "log and move on" — never block the user-facing response on
// email delivery.

const fs = require('fs');
const path = require('path');

// Lazy client — instantiating Resend at module load would crash boot if
// the API key isn't set yet (e.g. local dev without .env). We only build
// the client the first time it's needed and the key is present.
let resendClient = null;
const getClient = () => {
    if (resendClient) return resendClient;
    if (!process.env.RESEND_API_KEY) return null;
    const { Resend } = require('resend');
    resendClient = new Resend(process.env.RESEND_API_KEY);
    return resendClient;
};

const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

const fmtSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Render a plain-but-readable HTML body for the team notification.
// Designed for legibility in any email client (Gmail / Apple Mail / Outlook).
const renderBriefHtml = (s) => {
    const detailRow = (label, value) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6b6b6b;vertical-align:top;width:170px">${escape(label)}</td>
             <td style="padding:6px 0;color:#111;vertical-align:top">${value || '<em style="color:#999">—</em>'}</td></tr>`;

    const detailsRows = Object.entries(s.details)
        .map(([k, v]) => detailRow(k.replace(/_/g, ' '), escape(v)))
        .join('');

    const fileList = s.files.length
        ? '<ul style="margin:0;padding-left:18px">' +
              s.files.map((f) => {
                  const label = `${escape(f.originalName)} <span style="color:#888">(${fmtSize(f.size)})</span>`;
                  const linked = f.url
                      ? `<a href="${escape(f.url)}" style="color:#0145F2;text-decoration:underline">${label}</a>`
                      : label;
                  return `<li style="padding:2px 0">${linked}</li>`;
              }).join('') +
          '</ul>'
        : '<em style="color:#999">no attachments</em>';

    const modeLabel = s.mode === 'new' ? 'A NEW PROJECT' : 'AN EXISTING PROJECT';

    return `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;line-height:1.5;max-width:640px">
    <p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:0.18em;color:#0145F2;margin:0 0 6px 0">NEW BRIEF · ${escape(modeLabel)}</p>
    <h2 style="margin:0 0 4px 0;font-size:22px;letter-spacing:-0.01em">${escape(s.contact.name)}${s.contact.company ? ` · <span style="color:#666;font-weight:400">${escape(s.contact.company)}</span>` : ''}</h2>
    <p style="margin:0 0 24px 0;color:#888;font-size:13px">${escape(s.receivedAt)}</p>

    <h3 style="margin:24px 0 8px 0;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:#888">Contact</h3>
    <table style="border-collapse:collapse;width:100%">
        ${detailRow('Name', escape(s.contact.name))}
        ${detailRow('Email', `<a href="mailto:${escape(s.contact.email)}" style="color:#0145F2">${escape(s.contact.email)}</a>`)}
        ${detailRow('Company', escape(s.contact.company) || '')}
    </table>

    <h3 style="margin:24px 0 8px 0;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:#888">Project</h3>
    <table style="border-collapse:collapse;width:100%">
        ${detailsRows}
    </table>

    <h3 style="margin:24px 0 8px 0;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:#888">Files</h3>
    ${fileList}

    <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px 0">
    <p style="margin:0;color:#888;font-size:12px">
        Marketing opt-in: ${s.marketingOptIn ? '<strong style="color:#111">yes</strong>' : 'no'} ·
        Submission ID: <code style="background:#f5f5f5;padding:2px 5px;border-radius:3px">${escape(s.id)}</code>
    </p>
    <p style="margin:8px 0 0 0;color:#aaa;font-size:11px">
        IP ${escape(s.meta.ip || '?')} · ${escape((s.meta.userAgent || '').slice(0, 80))}
    </p>
</div>`;
};

// Send the team notification. Returns { ok, id } on success, { ok:false, error }
// on failure, or { skipped:true } when the API key isn't configured.
const sendBriefNotification = async (submission, files) => {
    const client = getClient();
    if (!client) {
        console.log('[email] RESEND_API_KEY not set — skipping team notification');
        return { skipped: true };
    }

    const to = process.env.BRIEF_NOTIFY_TO || 'hello@zeffron.ai';
    const from = process.env.BRIEF_NOTIFY_FROM || 'Zeffron Briefs <onboarding@resend.dev>';
    const replyTo = submission.contact.email;
    const company = submission.contact.company ? ` — ${submission.contact.company}` : '';
    const subject = `[Brief] ${submission.contact.name}${company} (${submission.mode} project)`;

    // Resend supports up to ~40MB total payload. Multer has already capped
    // each file at 25MB and the count at 10, so we're inside that envelope.
    // Buffers come straight from multer.memoryStorage — no disk read needed.
    const attachments = (files || [])
        .filter((f) => f && f.buffer)
        .map((f) => ({
            filename: f.originalname,
            content: f.buffer.toString('base64'),
        }));

    try {
        const result = await client.emails.send({
            from,
            to,
            replyTo,
            subject,
            html: renderBriefHtml(submission),
            attachments,
        });
        if (result?.error) {
            console.error('[email] brief send rejected:', result.error);
            return { ok: false, error: result.error.message || String(result.error) };
        }
        const id = result?.data?.id || null;
        console.log(`[email] notification sent → ${to} (id: ${id})`);
        return { ok: true, id };
    } catch (err) {
        console.error('[email] notification send failed:', err?.message || err);
        return { ok: false, error: err?.message || String(err) };
    }
};

// Render a plain-but-readable HTML body for the playbook lead notification.
// Mirrors the brief notification layout so the team sees a consistent format.
const renderPlaybookHtml = (s) => {
    const detailRow = (label, value) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6b6b6b;vertical-align:top;width:170px">${escape(label)}</td>
             <td style="padding:6px 0;color:#111;vertical-align:top">${value || '<em style="color:#999">—</em>'}</td></tr>`;

    return `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;line-height:1.5;max-width:640px">
    <p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:0.18em;color:#0145F2;margin:0 0 6px 0">NEW PLAYBOOK LEAD</p>
    <h2 style="margin:0 0 4px 0;font-size:22px;letter-spacing:-0.01em">${escape(s.lead.name)}</h2>
    <p style="margin:0 0 24px 0;color:#888;font-size:13px">${escape(s.receivedAt)}</p>

    <h3 style="margin:24px 0 8px 0;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:#888">Contact</h3>
    <table style="border-collapse:collapse;width:100%">
        ${detailRow('Name', escape(s.lead.name))}
        ${detailRow('Email', `<a href="mailto:${escape(s.lead.email)}" style="color:#0145F2">${escape(s.lead.email)}</a>`)}
    </table>

    <h3 style="margin:24px 0 8px 0;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:#888">Profile</h3>
    <table style="border-collapse:collapse;width:100%">
        ${detailRow('Role', escape(s.lead.role))}
        ${detailRow('Build stage', escape(s.lead.stage))}
    </table>

    <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px 0">
    <p style="margin:0;color:#888;font-size:12px">
        Source: <code style="background:#f5f5f5;padding:2px 5px;border-radius:3px">${escape(s.source)}</code> ·
        Submission ID: <code style="background:#f5f5f5;padding:2px 5px;border-radius:3px">${escape(s.id)}</code>
    </p>
    <p style="margin:8px 0 0 0;color:#aaa;font-size:11px">
        IP ${escape(s.meta.ip || '?')} · ${escape((s.meta.userAgent || '').slice(0, 80))}
    </p>
</div>`;
};

const sendPlaybookNotification = async (submission) => {
    const client = getClient();
    if (!client) {
        console.log('[email] RESEND_API_KEY not set — skipping playbook notification');
        return { skipped: true };
    }

    const to = process.env.PLAYBOOK_NOTIFY_TO || process.env.BRIEF_NOTIFY_TO || 'hello@zeffron.ai';
    const from = process.env.PLAYBOOK_NOTIFY_FROM || process.env.BRIEF_NOTIFY_FROM || 'Zeffron Playbook <onboarding@resend.dev>';
    const replyTo = submission.lead.email;
    const subject = `[Playbook] ${submission.lead.name} (${submission.lead.role} · ${submission.lead.stage})`;

    try {
        const result = await client.emails.send({
            from,
            to,
            replyTo,
            subject,
            html: renderPlaybookHtml(submission),
        });
        if (result?.error) {
            console.error('[email] playbook send rejected:', result.error);
            return { ok: false, error: result.error.message || String(result.error) };
        }
        const id = result?.data?.id || null;
        console.log(`[email] playbook notification sent → ${to} (id: ${id})`);
        return { ok: true, id };
    } catch (err) {
        console.error('[email] playbook send failed:', err?.message || err);
        return { ok: false, error: err?.message || String(err) };
    }
};

// --- Lead-facing playbook delivery -----------------------------------------
// Reads the PDF from disk once, caches the base64, and attaches it on every
// send. The PDF is 4.4 MB — well inside Resend's ~40 MB payload limit.
const PLAYBOOK_PDF_PATH = path.join(__dirname, '..', 'public', "Founder's Playbook.pdf");
let playbookPdfB64Cache = null;
const getPlaybookPdfBase64 = () => {
    if (playbookPdfB64Cache) return playbookPdfB64Cache;
    try {
        playbookPdfB64Cache = fs.readFileSync(PLAYBOOK_PDF_PATH).toString('base64');
        return playbookPdfB64Cache;
    } catch (err) {
        console.error('[email] could not read playbook PDF at', PLAYBOOK_PDF_PATH, '—', err.message);
        return null;
    }
};

const renderPlaybookDeliveryHtml = (s) => `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;line-height:1.6;max-width:600px">
    <p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:0.18em;color:#0145F2;margin:0 0 18px 0">THE FOUNDER'S AI PROMPT PLAYBOOK</p>
    <h2 style="margin:0 0 16px 0;font-size:24px;letter-spacing:-0.01em;color:#111">Hi ${escape(s.lead.name.split(/\s+/)[0] || s.lead.name)},</h2>
    <p style="margin:0 0 16px 0">Thanks for grabbing the playbook. It's attached to this email — 50+ prompts that take you from messy idea to MVP scope, user stories, and pitch deck in about thirty minutes.</p>
    <p style="margin:0 0 16px 0">A few things worth knowing:</p>
    <ul style="margin:0 0 20px 0;padding-left:20px;color:#333">
        <li style="padding:3px 0">Work through the stages in order. Each one builds on the last.</li>
        <li style="padding:3px 0">The MVP readiness quiz at the end is the part most founders skip — don't.</li>
        <li style="padding:3px 0">Hit reply with questions. We read every one.</li>
    </ul>
    <p style="margin:0 0 8px 0">If at any point you'd rather have us build it for you in ten days flat, here's our calendar:</p>
    <p style="margin:0 0 28px 0"><a href="https://cal.com/zeffron-ai/30min" style="color:#0145F2">cal.com/zeffron-ai/30min</a></p>
    <p style="margin:0;color:#666;font-size:14px">— The Zeffron team</p>
</div>`;

const sendPlaybookToLead = async (submission) => {
    const client = getClient();
    if (!client) {
        console.log('[email] RESEND_API_KEY not set — skipping lead-facing playbook delivery');
        return { skipped: true };
    }

    const pdfB64 = getPlaybookPdfBase64();
    if (!pdfB64) {
        return { ok: false, error: 'Playbook PDF not available on the server' };
    }

    const from = process.env.PLAYBOOK_DELIVERY_FROM || process.env.BRIEF_NOTIFY_FROM || 'Zeffron <onboarding@resend.dev>';
    const replyTo = process.env.PLAYBOOK_REPLY_TO || process.env.BRIEF_NOTIFY_TO || 'hello@zeffron.ai';
    const subject = "Your copy of The Founder's AI Prompt Playbook";

    try {
        const result = await client.emails.send({
            from,
            to: submission.lead.email,
            replyTo,
            subject,
            html: renderPlaybookDeliveryHtml(submission),
            attachments: [
                {
                    filename: "Founder's Playbook.pdf",
                    content: pdfB64,
                    contentType: 'application/pdf',
                },
            ],
        });
        if (result?.error) {
            console.error('[email] playbook delivery rejected:', result.error);
            return { ok: false, error: result.error.message || String(result.error) };
        }
        const id = result?.data?.id || null;
        console.log(`[email] playbook delivered → ${submission.lead.email} (id: ${id})`);
        return { ok: true, id };
    } catch (err) {
        console.error('[email] playbook delivery failed:', err?.message || err);
        return { ok: false, error: err?.message || String(err) };
    }
};

module.exports = { sendBriefNotification, sendPlaybookNotification, sendPlaybookToLead };

// ▶ TODO — customer-facing follow-up template (separate from team notification):
//   - Two HTML/plain-text templates per content.txt lines 187–249
//   - Personalisation tokens: {First Name}, {Insert Name of Project}, {X weeks}, {budget}
//   - Sender variants: hello@ / jonathan@ / samuel@
//   - 10-minute delay before send (BullMQ / setTimeout in-process / Resend
//     scheduled-send / external queue — pick based on deploy target)
//   - Routing: branch on submission.mode for which template renders
