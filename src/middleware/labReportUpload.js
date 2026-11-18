
const multer = require('multer');

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('UNSUPPORTED_PDF_TYPE'));
    }

    cb(null, true);
  },
});

function handleLabReportUpload(req, res, next) {
  upload.single('report')(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: {
            code: 'FILE_TOO_LARGE',
            message: 'PDF report must not exceed 5 MB.',
          },
        });
      }

      return res.status(400).json({
        error: {
          code: 'INVALID_UPLOAD',
          message: 'Invalid PDF upload.',
        },
      });
    }

    if (error.message === 'UNSUPPORTED_PDF_TYPE') {
      return res.status(400).json({
        error: {
          code: 'UNSUPPORTED_FILE_TYPE',
          message: 'Only PDF files are allowed.',
        },
      });
    }

    return next(error);
  });
}

function validatePdfSignature(req, res, next) {
  if (!req.file) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'PDF report is required.',
      },
    });
  }

  const buffer = req.file.buffer;

  // PDF files begin with the %PDF- signature.
  const isPdf =
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString('ascii') === '%PDF-';

  if (!isPdf) {
    return res.status(400).json({
      error: {
        code: 'INVALID_PDF',
        message: 'Uploaded file is not a valid PDF.',
      },
    });
  }

  next();
}

module.exports = {
  handleLabReportUpload,
  validatePdfSignature,
};
