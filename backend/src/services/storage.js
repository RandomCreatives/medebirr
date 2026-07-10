/**
 * Supabase Storage Service
 * Handles image uploads to Supabase Storage bucket 'product-images'
 */

const axios = require('axios');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'product-images';

/**
 * Upload a buffer to Supabase Storage
 * @param {Buffer} fileBuffer - The file data
 * @param {string} filePath - Storage path (e.g. storeId/pendingId/timestamp_0.jpg)
 * @param {string} contentType - MIME type
 * @returns {string} Public URL of the uploaded file
 */
async function uploadImage(fileBuffer, filePath, contentType = 'image/jpeg') {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Supabase Storage not configured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filePath}`;

  const res = await axios.post(url, fileBuffer, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'false'
    },
    timeout: 30000,
    maxContentLength: 15 * 1024 * 1024,
    maxBodyLength: 15 * 1024 * 1024
  });

  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
  }

  return getPublicUrl(filePath);
}

/**
 * Download a file from a URL and upload to Supabase Storage
 * @param {string} sourceUrl - URL to download from (e.g. Telegram file URL)
 * @param {string} filePath - Storage path
 * @param {string} contentType - MIME type
 * @returns {string} Public URL of the uploaded file
 */
async function downloadAndUpload(sourceUrl, filePath, contentType = 'image/jpeg') {
  const res = await axios.get(sourceUrl, {
    responseType: 'arraybuffer',
    timeout: 30000,
    maxContentLength: 15 * 1024 * 1024
  });

  return uploadImage(Buffer.from(res.data), filePath, contentType);
}

/**
 * Get the public URL for a stored file
 */
function getPublicUrl(filePath) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filePath}`;
}

/**
 * Delete a file from storage
 */
async function deleteImage(filePath) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;

  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filePath}`;
  try {
    await axios.delete(url, {
      headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` },
      timeout: 10000
    });
  } catch (err) {
    console.warn('Failed to delete image:', filePath, err.message);
  }
}

module.exports = { uploadImage, downloadAndUpload, getPublicUrl, deleteImage, BUCKET };
