/**
 * Multer configuration for menu item image uploads.
 *
 * Files are stored on disk under backend/uploads/ and served publicly
 * at /uploads/<filename>. Rules:
 *   - images only (jpg, jpeg, png, webp, gif)
 *   - max 5 MB per file
 *   - max 5 files per request
 * The >= 2 images rule is enforced in menuController (after upload),
 * because multer has already written the files by the time the route
 * handler runs — failed requests clean up their own files there.
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

// Ensure the upload directory exists at boot.
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_FILES = 5;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `menu-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext) && !String(file.mimetype).startsWith('image/')) {
      return cb(new Error('Only image files are allowed (jpg, jpeg, png, webp, gif).'));
    }
    return cb(null, true);
  },
});

/**
 * Multer configuration for restaurant image uploads (logo, gallery).
 * Same rules as menu images but with 'restaurant-' prefix for filenames.
 */
const restaurantStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `restaurant-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    cb(null, unique);
  },
});

const uploadRestaurant = multer({
  storage: restaurantStorage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext) && !String(file.mimetype).startsWith('image/')) {
      return cb(new Error('Only image files are allowed (jpg, jpeg, png, webp, gif).'));
    }
    return cb(null, true);
  },
});

/** Build the public URL for an uploaded file. */
function publicUrl(file) {
  return `/uploads/${file.filename}`;
}

/** Best-effort cleanup of uploaded files (used when a request fails validation). */
function cleanupFiles(files) {
  for (const f of files || []) {
    fs.unlink(f.path, () => {});
  }
}

module.exports = { upload, uploadRestaurant, UPLOAD_DIR, publicUrl, cleanupFiles, MAX_FILES };