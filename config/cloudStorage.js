/**
 * Cloud Storage Adapter
 * Integrates ImageKit cloud storage for production/dev with automatic fallback to local uploads/.
 */
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Initialize ImageKit instance if credentials are provided
let imagekit = null;
if (
  process.env.IMAGEKIT_PUBLIC_KEY &&
  process.env.IMAGEKIT_PRIVATE_KEY &&
  process.env.IMAGEKIT_URL_ENDPOINT
) {
  try {
    const ImageKit = require('imagekit');
    imagekit = new ImageKit({
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
    });
    console.log('✅ ImageKit Cloud Storage initialized successfully');
  } catch (err) {
    console.error('⚠️ Failed to initialize ImageKit SDK:', err.message);
  }
}

/**
 * Get the storage configuration based on environment.
 */
function getStorageConfig() {
  if (imagekit) {
    return {
      provider: 'imagekit',
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
    };
  }

  const provider = process.env.CLOUD_STORAGE_PROVIDER;

  if (provider === 's3') {
    return {
      provider: 's3',
      bucket: process.env.CLOUD_STORAGE_BUCKET,
      region: process.env.CLOUD_STORAGE_REGION,
      accessKey: process.env.CLOUD_STORAGE_ACCESS_KEY,
      secretKey: process.env.CLOUD_STORAGE_SECRET_KEY,
      getPublicUrl: (filename) =>
        `https://${process.env.CLOUD_STORAGE_BUCKET}.s3.${process.env.CLOUD_STORAGE_REGION}.amazonaws.com/${filename}`,
    };
  }

  // Fallback to local
  return {
    provider: 'local',
    uploadDir: UPLOAD_DIR,
    getPublicUrl: (filename) => `/uploads/${filename}`,
  };
}

/**
 * Upload a file to configured storage provider (ImageKit or local).
 *
 * @param {Object} file - Multer file object
 * @returns {Promise<string>} Public URL of the uploaded file
 */
async function uploadFile(file) {
  // If ImageKit is configured, upload to ImageKit cloud
  if (imagekit && file && file.path) {
    try {
      const fileStream = fs.createReadStream(file.path);
      const result = await imagekit.upload({
        file: fileStream,
        fileName: file.filename || `${Date.now()}_${file.originalname}`,
        folder: '/kabadiwala-connect',
        tags: ['scrap_lot', 'kabadiwala', 'waste_traceability'],
        useUniqueFileName: true,
      });

      // Clean up local temp file after successful cloud upload
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      console.log(`☁️ Uploaded to ImageKit: ${result.url}`);
      return result.url;
    } catch (err) {
      console.error('⚠️ ImageKit upload failed, falling back to local file:', err.message);
      return `/uploads/${file.filename}`;
    }
  }

  // Fallback to local uploads
  const config = getStorageConfig();
  if (config.getPublicUrl && file.filename) {
    return config.getPublicUrl(file.filename);
  }
  return `/uploads/${file.filename}`;
}

/**
 * Delete a file from storage provider.
 *
 * @param {string} fileUrl - The URL/path of the file to delete
 */
async function deleteFile(fileUrl) {
  if (!fileUrl) return;

  // Local file delete
  if (fileUrl.startsWith('/uploads/')) {
    const filename = path.basename(fileUrl);
    const filepath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
    return;
  }

  // ImageKit delete by file ID if needed
  if (imagekit && fileUrl.includes('imagekit.io')) {
    try {
      // Find file by name
      const filename = path.basename(fileUrl.split('?')[0]);
      const list = await imagekit.listFiles({ name: filename, limit: 1 });
      if (list && list.length > 0) {
        await imagekit.deleteFile(list[0].fileId);
        console.log(`🗑️ Deleted from ImageKit: ${filename}`);
      }
    } catch (err) {
      console.warn('⚠️ Could not delete from ImageKit:', err.message);
    }
  }
}

module.exports = {
  getStorageConfig,
  uploadFile,
  deleteFile,
  UPLOAD_DIR,
};
