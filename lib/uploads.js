// File uploads: customer logos, owner mockups, deal photos.
// On Render, point UPLOAD_DIR at the persistent disk (e.g. /var/data/uploads).
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'db', 'uploads');
const DIRS = {
  artwork: path.join(ROOT, 'artwork'),
  mockups: path.join(ROOT, 'mockups'),
  deals: path.join(ROOT, 'deals'),
};
Object.values(DIRS).forEach((d) => fs.mkdirSync(d, { recursive: true }));

const ALLOWED = {
  artwork: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf', '.ai', '.eps', '.psd'],
  mockups: ['.png', '.jpg', '.jpeg', '.webp', '.pdf'],
  deals: ['.png', '.jpg', '.jpeg', '.webp'],
};

function make(kind, maxMb, files) {
  return multer({
    storage: multer.diskStorage({
      destination: DIRS[kind],
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        cb(null, crypto.randomBytes(12).toString('hex') + ext);
      },
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: files || 1, fields: 40 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (ALLOWED[kind].includes(ext)) return cb(null, true);
      const err = new Error('That file type is not supported. Use: ' + ALLOWED[kind].join(', '));
      err.status = 400;
      cb(err);
    },
  });
}

const upload = {
  artwork: make('artwork', 20),
  mockup: make('mockups', 15, 6),
  deal: make('deals', 10),
};

function filePath(kind, name) {
  if (!name || !/^[a-f0-9]{24}\.[a-z0-9]+$/.test(name)) return null;
  return path.join(DIRS[kind], name);
}

function remove(kind, name) {
  const p = filePath(kind, name);
  if (p) fs.unlink(p, () => {});
}

// Wrap a multer middleware so errors become clean JSON responses.
function handle(mw) {
  return (req, res, next) =>
    mw(req, res, (err) => {
      if (!err) return next();
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'That file is too big.' : err.code === 'LIMIT_FILE_COUNT' ? 'Too many files at once.' : err.message || 'Upload failed.';
      res.status(err.status || 400).json({ ok: false, error: msg });
    });
}

module.exports = { upload, handle, filePath, remove, DIRS };
