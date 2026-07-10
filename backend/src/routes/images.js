/**
 * Image Upload routes
 * Handles file uploads to Supabase Storage
 */

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { uploadImage } = require('../services/storage');

const router = express.Router();

// Multer in-memory storage (no temp files on disk)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 5 // max 5 files
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP`));
    }
  }
});

/**
 * POST /api/v1/images/upload
 * Upload up to 5 images to Supabase Storage
 * Returns array of public URLs
 */
router.post('/upload', requireAuth, upload.array('images', 5), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No images provided' });
    }

    const storeId = req.body.store_id;
    if (!storeId) {
      return res.status(400).json({ error: 'store_id is required' });
    }

    const urls = [];
    const timestamp = Date.now();

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const ext = file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
      const filePath = `${storeId}/${timestamp}_${i}.${ext}`;

      const url = await uploadImage(file.buffer, filePath, file.mimetype);
      urls.push(url);
    }

    res.json({ urls, count: urls.length });
  } catch (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 10MB per image.' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'Too many files. Maximum is 5 images.' });
      }
    }
    next(err);
  }
});

module.exports = router;
