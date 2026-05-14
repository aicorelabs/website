// Resend wrapper + brief-notification template.
// All public exports are async; callers should treat any non-success
// outcome as "log and move on" — never block the user-facing response on
// email delivery.

const fs = require('fs');

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
              s.files.map((f) =>
                  `<li style="padding:2px 0">${escape(f.originalName)} <span style="color:#888">(${fmtSize(f.size)})</span></li>`
              ).join('') +
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
    const attachments = (files || []).map((f) => ({
        filename: f.originalname,
        content: fs.readFileSync(f.path).toString('base64'),
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
        const id = result?.data?.id || null;
        console.log(`[email] notification sent → ${to} (id: ${id})`);
        return { ok: true, id };
    } catch (err) {
        console.error('[email] notification send failed:', err?.message || err);
        return { ok: false, error: err?.message || String(err) };
    }
};

module.exports = { sendBriefNotification };

// ▶ TODO — customer-facing follow-up template (separate from team notification):
//   - Two HTML/plain-text templates per content.txt lines 187–249
//   - Personalisation tokens: {First Name}, {Insert Name of Project}, {X weeks}, {budget}
//   - Sender variants: hello@ / jonathan@ / samuel@
//   - 10-minute delay before send (BullMQ / setTimeout in-process / Resend
//     scheduled-send / external queue — pick based on deploy target)
//   - Routing: branch on submission.mode for which template renders
