
const multer = require('multer');

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('UNSUPPORTED_IMAGE_TYPE'));
    }

    cb(null, true);
  },
});

// Convert Multer errors into consistent JSON responses.
function handleEmergencyPhotoUpload(req, res, next) {
  upload.single('photo')(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: {
            code: 'FILE_TOO_LARGE',
            message: 'Photo must not exceed 5 MB',
          },
        });
      }

      return res.status(400).json({
        error: {
          code: 'INVALID_UPLOAD',
          message: 'Invalid photo upload',
        },
      });
    }

    if (error.message === 'UNSUPPORTED_IMAGE_TYPE') {
      return res.status(400).json({
        error: {
          code: 'UNSUPPORTED_IMAGE_TYPE',
          message: 'Only JPEG, PNG, and WebP images are allowed',
        },
      });
    }

    return next(error);
  });
}

function validateImageSignature(req, res, next) {
  if (!req.file) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Photo is required',
      },
    });
  }

  const buffer = req.file.buffer;

  const isJpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  const isPng =
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([
        0x89, 0x50, 0x4e, 0x47,
        0x0d, 0x0a, 0x1a, 0x0a,
      ])
    );

  const isWebp =
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP';

  if (!isJpeg && !isPng && !isWebp) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Uploaded file is not a valid supported image',
      },
    });
  }

  next();
}

module.exports = {
  handleEmergencyPhotoUpload,
  validateImageSignature,
};
