/**
 * Upload Middleware
 * Multer configuration for file uploads.
 */
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { UPLOAD_DIR } = require('../config/cloudStorage');

// Allowed image MIME types
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;

/**
 * Multer storage — saves files with UUID filenames to prevent collisions.
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

/**
 * File filter — only allow images.
 */
function fileFilter(req, file, cb) {
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type '${file.mimetype}' is not allowed. Accepted: ${ALLOWED_TYPES.join(', ')}`), false);
  }
}

/**
 * Single image upload middleware.
 * Field name: 'image'
 */
const uploadSingle = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
}).single('image');

/**
 * Multiple image upload middleware.
 * Field name: 'photos'
 */
const uploadMultiple = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
}).array('photos', MAX_FILES);

/**
 * Wrapper that handles multer errors gracefully.
 */
function handleUpload(uploadFn) {
  return (req, res, next) => {
    uploadFn(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: `File too large. Maximum size: ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            message: `Too many files. Maximum: ${MAX_FILES}`,
          });
        }
        return res.status(400).json({ success: false, message: err.message });
      }

      if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }

      next();
    });
  };
}

module.exports = {
  uploadSingle: handleUpload(uploadSingle),
  uploadMultiple: handleUpload(uploadMultiple),
};
