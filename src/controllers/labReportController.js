
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const pool = require('../config/db');

const uploadDirectory = path.join(
  process.cwd(),
  'uploads',
  'lab-reports'
);

async function uploadLabReport(req, res) {
  let client;
  let savedFilePath;

  try {
    const { bookingId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'PDF report is required.',
        },
      });
    }

    const originalFilename = path
      .basename(file.originalname)
      .replace(/[\x00-\x1F\x7F]/g, '')
      .slice(0, 255);

    if (!originalFilename) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A valid original filename is required.',
        },
      });
    }

    client = await pool.connect();

    await client.query('BEGIN');

    // Lock the booking to prevent concurrent report uploads.
    const bookingResult = await client.query(
      `SELECT id, patient_id, status
       FROM lab_bookings
       WHERE id = $1
       FOR UPDATE`,
      [bookingId]
    );

    if (bookingResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        error: {
          code: 'BOOKING_NOT_FOUND',
          message: 'Lab booking not found.',
        },
      });
    }

    const booking = bookingResult.rows[0];

    if (booking.status !== 'processing') {
      await client.query('ROLLBACK');

      return res.status(409).json({
        error: {
          code: 'INVALID_BOOKING_STATUS',
          message: 'Reports can only be uploaded for bookings in processing status.',
        },
      });
    }

    const reportId = `LR-${crypto.randomBytes(10).toString('hex').toUpperCase()}`;
    const healthRecordId = `HR-${crypto.randomBytes(10).toString('hex').toUpperCase()}`;

    const filename = `${reportId}.pdf`;

    await fs.mkdir(uploadDirectory, { recursive: true });

    savedFilePath = path.join(uploadDirectory, filename);

    // Save using a server-generated filename.
    await fs.writeFile(savedFilePath, file.buffer, {
      flag: 'wx',
    });

    const relativeFilePath = path.join(
      'uploads',
      'lab-reports',
      filename
    ).replace(/\\/g, '/');

    // Automatically create the patient's health record.
    await client.query(
      `INSERT INTO health_records (
         id,
         patient_id,
         record_type,
         title,
         description,
         created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        healthRecordId,
        booking.patient_id,
        'lab_report',
        `Laboratory Report - ${bookingId}`,
        `Laboratory report generated for booking ${bookingId}.`,
        req.user.id,
      ]
    );

    // Register the uploaded report and link it to the health record.
    const reportResult = await client.query(
      `INSERT INTO lab_reports (
         id,
         lab_booking_id,
         health_record_id,
         patient_id,
         report_path,
         original_filename,
         mime_type,
         file_size,
         uploaded_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING
         id,
         lab_booking_id AS "bookingId",
         health_record_id AS "healthRecordId",
         patient_id AS "patientId",
         original_filename AS "originalFilename",
         mime_type AS "mimeType",
         file_size AS "fileSize",
         status,
         uploaded_at AS "uploadedAt"`,
      [
        reportId,
        bookingId,
        healthRecordId,
        booking.patient_id,
        relativeFilePath,
        originalFilename,
        'application/pdf',
        file.size,
        req.user.id,
      ]
    );

    // Complete the booking after successful report registration.
    await client.query(
      `UPDATE lab_bookings
       SET status = 'completed',
           updated_at = NOW()
       WHERE id = $1`,
      [bookingId]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Laboratory report uploaded successfully.',
      data: reportResult.rows[0],
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }

    // Remove the saved file if database registration failed.
    if (savedFilePath) {
      await fs.unlink(savedFilePath).catch(() => {});
    }

    console.error('Upload lab report error:', error.message);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to upload laboratory report.',
      },
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}


async function listLabReports(req, res) {
  try {
    const values = [];
    let whereClause = '';

    if (req.user.role === 'patient') {
      values.push(req.user.id);
      whereClause = 'WHERE lr.patient_id = $1';
    } else if (req.query.patientId) {
      values.push(req.query.patientId);
      whereClause = 'WHERE lr.patient_id = $1';
    }

    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 20, 1),
      100
    );

    const offset = Math.max(
      parseInt(req.query.offset, 10) || 0,
      0
    );

    values.push(limit, offset);

    const result = await pool.query(
      `
      SELECT
        lr.id,
        lr.lab_booking_id AS "bookingId",
        lr.health_record_id AS "healthRecordId",
        lr.patient_id AS "patientId",
        lr.original_filename AS "originalFilename",
        lr.mime_type AS "mimeType",
        lr.file_size AS "fileSize",
        lr.status,
        lr.uploaded_at AS "uploadedAt",
        hr.title AS "recordTitle",
        hr.record_type AS "recordType"
      FROM lab_reports lr
      JOIN health_records hr
        ON hr.id = lr.health_record_id
      ${whereClause}
      ORDER BY lr.uploaded_at DESC
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
      `,
      values
    );

    return res.status(200).json({
      message: 'Laboratory reports retrieved successfully.',
      data: result.rows
    });
  } catch (error) {
    console.error('List lab reports error:', error);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unable to retrieve laboratory reports.'
      }
    });
  }
}

async function downloadLabReport(req, res) {
  try {
    const { id } = req.params;

    const values = [id];
    let ownershipClause = '';

    if (req.user.role === 'patient') {
      values.push(req.user.id);
      ownershipClause = 'AND patient_id = $2';
    }

    const result = await pool.query(
      `
      SELECT id, patient_id, report_path, original_filename, status
      FROM lab_reports
      WHERE id = $1
      ${ownershipClause}
      `,
      values
    );

    const report = result.rows[0];

    if (!report || report.status !== 'available') {
      return res.status(404).json({
        error: {
          code: 'REPORT_NOT_FOUND',
          message: 'Laboratory report not found.'
        }
      });
    }

    const uploadDirectory = path.resolve(
      process.cwd(),
      'uploads',
      'lab-reports'
    );

    const filePath = path.resolve(process.cwd(), report.report_path);

    // Prevent paths outside the lab-reports directory.
    if (!filePath.startsWith(uploadDirectory + path.sep)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REPORT_PATH',
          message: 'Invalid report file path.'
        }
      });
    }

    await fs.access(filePath);

    return res.download(
      filePath,
      report.original_filename,
      (error) => {
        if (error) {
          console.error('Report download failed:', error.message);

          if (!res.headersSent) {
            res.status(500).json({
              error: {
                code: 'DOWNLOAD_FAILED',
                message: 'Unable to download laboratory report.'
              }
            });
          }
        }
      }
    );
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({
        error: {
          code: 'REPORT_FILE_NOT_FOUND',
          message: 'Laboratory report file not found.'
        }
      });
    }

    console.error('Download lab report error:', error);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unable to download laboratory report.'
      }
    });
  }
}

module.exports = {
  uploadLabReport,
  listLabReports,
  downloadLabReport
};
