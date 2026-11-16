
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const pool = require('../config/db');

const PHOTO_DIRECTORY = path.join(
  process.cwd(),
  'uploads',
  'emergency-photos'
);

const TOKEN_EXPIRY_MINUTES = 10;

function sendError(res, status, code, message) {
  return res.status(status).json({
    error: { code, message },
  });
}

// Create a random token and store only its SHA-256 hash.
async function createUploadToken(client, bookingId, purpose) {
  const token = crypto.randomBytes(32).toString('hex');

  const tokenHash = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  await client.query(
    `INSERT INTO booking_upload_tokens
      (booking_id, token_hash, purpose, expires_at)
     VALUES (
       $1, $2, $3,
       NOW() + INTERVAL '${TOKEN_EXPIRY_MINUTES} minutes'
     )`,
    [bookingId, tokenHash, purpose]
  );

  return token;
}

// Upload endpoint: verifies token, stores photo, and consumes token.
async function uploadEmergencyPhoto(req, res) {
  const token = req.get('X-Upload-Token');
  const purpose = req.params.purpose;

  if (
    typeof token !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(token)
  ) {
    return sendError(
      res, 401, 'INVALID_UPLOAD_TOKEN', 'A valid upload token is required'
    );
  }

  if (!['security', 'incident'].includes(purpose)) {
    return sendError(
      res, 400, 'VALIDATION_ERROR', 'Invalid photo purpose'
    );
  }

  const tokenHash = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  let client;
  let savedFilePath;

  try {
    client = await pool.connect();

    await client.query('BEGIN');

    const tokenResult = await client.query(
      `SELECT id, booking_id
       FROM booking_upload_tokens
       WHERE token_hash = $1
         AND purpose = $2
         AND expires_at > NOW()
         AND consumed_at IS NULL
       FOR UPDATE`,
      [tokenHash, purpose]
    );

    if (tokenResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return sendError(
        res, 401, 'INVALID_OR_EXPIRED_TOKEN',
        'Upload token is invalid, expired, or already used'
      );
    }

    const uploadToken = tokenResult.rows[0];

    const column = purpose === 'security'
      ? 'security_photo_path'
      : 'incident_photo_path';

    const bookingResult = await client.query(
      `SELECT id, ${column}
       FROM bookings
       WHERE id = $1
       FOR UPDATE`,
      [uploadToken.booking_id]
    );

    if (bookingResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return sendError(
        res, 404, 'NOT_FOUND', 'Booking not found'
      );
    }

    if (bookingResult.rows[0][column]) {
      await client.query('ROLLBACK');

      return sendError(
        res, 409, 'PHOTO_ALREADY_UPLOADED',
        'A photo for this purpose has already been uploaded'
      );
    }

    const extensionByMime = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };

    const extension = extensionByMime[req.file.mimetype];

    if (!extension) {
      await client.query('ROLLBACK');

      return sendError(
        res, 400, 'VALIDATION_ERROR', 'Unsupported image type'
      );
    }

    await fs.mkdir(PHOTO_DIRECTORY, { recursive: true });

    const filename = `${crypto.randomUUID()}${extension}`;
    savedFilePath = path.join(PHOTO_DIRECTORY, filename);

    await fs.writeFile(savedFilePath, req.file.buffer, {
      flag: 'wx',
      mode: 0o600,
    });

    const relativePath = path.posix.join(
      'uploads',
      'emergency-photos',
      filename
    );

    await client.query(
      `UPDATE bookings
       SET ${column} = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [relativePath, uploadToken.booking_id]
    );

    await client.query(
      `UPDATE booking_upload_tokens
       SET consumed_at = NOW()
       WHERE id = $1`,
      [uploadToken.id]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      data: {
        bookingId: uploadToken.booking_id,
        purpose,
        uploaded: true,
      },
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(
          'Photo upload rollback failed:',
          rollbackError.message
        );
      }
    }

    if (savedFilePath) {
      await fs.unlink(savedFilePath).catch(() => {});
    }

    console.error('Emergency photo upload failed:', error.message);

    return sendError(
      res, 500, 'INTERNAL_ERROR', 'Unable to upload emergency photo'
    );
  } finally {
    if (client) {
      client.release();
    }
  }
}

module.exports = {
  createUploadToken,
  uploadEmergencyPhoto,
};
