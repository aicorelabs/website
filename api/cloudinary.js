// Cloudinary wrapper used by /api/brief to push uploaded files to Cloudinary
// instead of persisting them to local disk. `resource_type: 'auto'` lets
// Cloudinary route images, video, and raw files (PDFs, docs) to the right
// pipeline without us having to sniff MIME types here.

const cloudinary = require('cloudinary').v2;

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || '';
const API_KEY = process.env.CLOUDINARY_API_KEY || '';
const API_SECRET = process.env.CLOUDINARY_API_SECRET || '';

let configured = false;
if (CLOUD_NAME && API_KEY && API_SECRET) {
    cloudinary.config({
        cloud_name: CLOUD_NAME,
        api_key: API_KEY,
        api_secret: API_SECRET,
        secure: true,
    });
    configured = true;
} else {
    console.warn('[cloudinary] CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET not all set — uploads will fail until configured.');
}

const isConfigured = () => configured;

// Upload a single in-memory buffer. Returns the canonical secure URL,
// public_id (for later deletion), and the size Cloudinary recorded.
// `originalName` is used to derive a sensible public_id suffix so files
// in the Cloudinary dashboard are recognisable.
const uploadBuffer = (buffer, originalName, folder = 'zeffron/briefs') => new Promise((resolve, reject) => {
    if (!configured) {
        return reject(new Error('Cloudinary is not configured'));
    }

    // Strip extension + sanitise so Cloudinary's public_id is URL-safe.
    const base = String(originalName || 'file').replace(/\.[^.]+$/, '').replace(/[^a-z0-9.\-_]/gi, '_').slice(0, 80);
    const uniq = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const stream = cloudinary.uploader.upload_stream(
        {
            folder,
            public_id: `${uniq}_${base}`,
            resource_type: 'auto',
            use_filename: false,
            unique_filename: false,
            overwrite: false,
        },
        (err, result) => {
            if (err) return reject(err);
            resolve({
                url: result.secure_url,
                publicId: result.public_id,
                bytes: result.bytes,
                format: result.format || null,
                resourceType: result.resource_type || null,
            });
        }
    );
    stream.end(buffer);
});

module.exports = { uploadBuffer, isConfigured };
