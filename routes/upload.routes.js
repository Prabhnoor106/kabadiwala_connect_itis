/**
 * Upload Routes
 * Provides endpoints for direct image upload and client-side ImageKit authentication.
 */
const { Router } = require('express');
const { uploadSingle } = require('../middleware/upload.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { uploadFile, getStorageConfig } = require('../config/cloudStorage');
const { success, error } = require('../utils/response');

const router = Router();

// Uploading and handing out storage credentials both cost money and write to
// the shared bucket — only authenticated users (collectors and recyclers) may.
router.use(authenticate);

/**
 * POST /api/v1/upload
 * Upload an image file (camera snapshot or gallery) directly to cloud storage.
 */
router.post('/', uploadSingle, async (req, res, next) => {
  try {
    if (!req.file) {
      return error(res, { message: 'No image file provided', statusCode: 400 });
    }

    const publicUrl = await uploadFile(req.file);

    return success(res, {
      statusCode: 201,
      message: 'Image uploaded successfully',
      data: {
        url: publicUrl,
        filename: req.file.filename || req.file.originalname,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/upload/auth
 * Get authentication parameters for client-side ImageKit uploads if needed.
 */
router.get('/auth', (req, res, next) => {
  try {
    const config = getStorageConfig();
    if (config.provider !== 'imagekit') {
      return error(res, { message: 'ImageKit provider is not active', statusCode: 400 });
    }

    const ImageKit = require('imagekit');
    const ik = new ImageKit({
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
    });

    const authParams = ik.getAuthenticationParameters();
    return success(res, {
      data: {
        ...authParams,
        publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
        urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
