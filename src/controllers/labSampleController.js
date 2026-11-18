
const crypto = require('crypto');
const pool = require('../config/db');

// Create a sample and associate it with the selected tests in a booking.
async function createLabSample(req, res) {
  let client;

  try {
    const { bookingId } = req.params;
    const { sampleType, labBookingTestIds, notes } = req.body || {};

    if (
      !sampleType ||
      typeof sampleType !== 'string' ||
      sampleType.trim().length > 50 ||
      !Array.isArray(labBookingTestIds)
    ) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Provide a valid sampleType and labBookingTestIds array.',
        },
      });
    }

    if (
      labBookingTestIds.length === 0 ||
      labBookingTestIds.length > 20 ||
      labBookingTestIds.some(
        (id) => !/^[1-9]\d*$/.test(String(id))
      ) ||
      new Set(labBookingTestIds.map(String)).size !== labBookingTestIds.length
    ) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Select 1-20 unique valid lab booking test IDs.',
        },
      });
    }

    if (
      notes !== undefined &&
      (typeof notes !== 'string' || notes.length > 1000)
    ) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Notes must be a string of at most 1000 characters.',
        },
      });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const bookingResult = await client.query(
      `SELECT id, status
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

    if (!['confirmed', 'sample_collected'].includes(booking.status)) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        error: {
          code: 'INVALID_BOOKING_STATUS',
          message: 'Samples can only be collected for confirmed bookings.',
        },
      });
    }

    const testsResult = await client.query(
      `SELECT
         bt.id,
         lt.sample_type AS "sampleType"
       FROM lab_booking_tests bt
       JOIN lab_tests lt ON lt.id = bt.lab_test_id
       WHERE bt.lab_booking_id = $1
         AND bt.id = ANY($2::bigint[])`,
      [bookingId, labBookingTestIds]
    );

    if (testsResult.rowCount !== labBookingTestIds.length) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        error: {
          code: 'INVALID_BOOKING_TESTS',
          message: 'One or more selected tests do not belong to this booking.',
        },
      });
    }

    const requestedSampleType = sampleType.trim().toLowerCase();

    if (
      testsResult.rows.some(
        (test) => test.sampleType.toLowerCase() !== requestedSampleType
      )
    ) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        error: {
          code: 'SAMPLE_TYPE_MISMATCH',
          message: 'All selected tests must use the specified sample type.',
        },
      });
    }

    const sampleId = `LS-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    const barcode = `LAB-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

    const sampleResult = await client.query(
      `INSERT INTO lab_samples
         (id, lab_booking_id, barcode, sample_type, collected_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING
         id,
         lab_booking_id AS "bookingId",
         barcode,
         sample_type AS "sampleType",
         status,
         collected_at AS "collectedAt",
         collected_by AS "collectedBy",
         notes`,
      [
        sampleId,
        bookingId,
        barcode,
        sampleType.trim(),
        req.user.id,
        notes || null,
      ]
    );

    for (const test of testsResult.rows) {
      await client.query(
        `INSERT INTO lab_sample_tests
           (sample_id, lab_booking_test_id)
         VALUES ($1, $2)`,
        [sampleId, test.id]
      );
    }

    // Mark the booking as sample_collected after the first sample.
    if (booking.status === 'confirmed') {
      await client.query(
        `UPDATE lab_bookings
         SET status = 'sample_collected',
             updated_at = NOW()
         WHERE id = $1`,
        [bookingId]
      );
    }

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Lab sample created successfully.',
      data: {
        ...sampleResult.rows[0],
        labBookingTestIds: testsResult.rows.map((test) => test.id),
      },
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }

    console.error('Create lab sample error:', error.message);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to create lab sample.',
      },
    });
  } finally {
    if (client) client.release();
  }
}


// Retrieve sample details using its barcode.
async function getLabSampleByBarcode(req, res) {
  try {
    const { barcode } = req.params;

    const params = [barcode];
    let ownershipClause = '';

    if (req.user.role === 'patient') {
      params.push(req.user.id);
      ownershipClause = 'AND b.patient_id = $2';
    }

    const result = await pool.query(
      `SELECT
         s.id,
         s.lab_booking_id AS "bookingId",
         s.barcode,
         s.sample_type AS "sampleType",
         s.status,
         s.collected_at AS "collectedAt",
         s.received_at AS "receivedAt",
         s.notes,
         b.patient_id AS "patientId",
         COALESCE(
           json_agg(
             json_build_object(
               'labBookingTestId', bt.id,
               'testId', lt.id,
               'testName', lt.name
             )
           ) FILTER (WHERE bt.id IS NOT NULL),
           '[]'
         ) AS tests
       FROM lab_samples s
       JOIN lab_bookings b ON b.id = s.lab_booking_id
       LEFT JOIN lab_sample_tests st ON st.sample_id = s.id
       LEFT JOIN lab_booking_tests bt ON bt.id = st.lab_booking_test_id
       LEFT JOIN lab_tests lt ON lt.id = bt.lab_test_id
       WHERE s.barcode = $1 ${ownershipClause}
       GROUP BY s.id, b.patient_id`,
      params
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Lab sample not found.',
        },
      });
    }

    return res.status(200).json({
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Get lab sample error:', error.message);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to retrieve lab sample.',
      },
    });
  }
}


// Update the lifecycle status of a sample.
async function updateLabSampleStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    const allowedStatuses = [
      'received',
      'processing',
      'processed',
      'rejected',
    ];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Provide a valid sample status.',
        },
      });
    }

    const result = await pool.query(
      `UPDATE lab_samples
       SET status = $1,
           received_at = CASE
             WHEN $1 = 'received' THEN COALESCE(received_at, NOW())
             ELSE received_at
           END,
           updated_at = NOW()
       WHERE id = $2
         AND (
           (status = 'collected' AND $1 IN ('received', 'rejected'))
           OR (status = 'received' AND $1 IN ('processing', 'rejected'))
           OR (status = 'processing' AND $1 IN ('processed', 'rejected'))
         )
       RETURNING
         id,
         lab_booking_id AS "bookingId",
         barcode,
         sample_type AS "sampleType",
         status,
         collected_at AS "collectedAt",
         received_at AS "receivedAt",
         updated_at AS "updatedAt"`,
      [status, id]
    );

    if (result.rowCount === 0) {
      const sampleExists = await pool.query(
        'SELECT id FROM lab_samples WHERE id = $1',
        [id]
      );

      if (sampleExists.rowCount === 0) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Lab sample not found.',
          },
        });
      }

      return res.status(409).json({
        error: {
          code: 'INVALID_STATUS_TRANSITION',
          message: 'This sample status transition is not allowed.',
        },
      });
    }

    return res.status(200).json({
      message: 'Lab sample status updated successfully.',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update lab sample status error:', error.message);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to update lab sample status.',
      },
    });
  }
}


module.exports = {
  createLabSample,
  getLabSampleByBarcode,
  updateLabSampleStatus,
};
