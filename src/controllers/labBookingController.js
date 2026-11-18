
const pool = require('../config/db');

async function createLabBooking(req, res) {
  const client = await pool.connect();

  try {
    const { hospitalId, scheduledAt, testIds, notes } = req.body;

    // Patients can only book for themselves.
    // Ops and admins can create bookings for a specified patient.
    const patientId =
      req.user.role === 'patient'
        ? req.user.id
        : req.body.patientId;

    if (!patientId || !hospitalId || !scheduledAt || !Array.isArray(testIds)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'patientId (for staff), hospitalId, scheduledAt and testIds are required.',
        },
      });
    }

    if (
      testIds.length === 0 ||
      testIds.length > 20 ||
      testIds.some((id) => typeof id !== 'string' || !id.trim()) ||
      new Set(testIds).size !== testIds.length
    ) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Select 1-20 unique valid laboratory test IDs.',
        },
      });
    }

    const appointmentDate = new Date(scheduledAt);

    if (
      Number.isNaN(appointmentDate.getTime()) ||
      appointmentDate <= new Date()
    ) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'scheduledAt must be a valid future date and time.',
        },
      });
    }

    if (notes !== undefined && (typeof notes !== 'string' || notes.length > 1000)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Notes must be a string of at most 1000 characters.',
        },
      });
    }

    await client.query('BEGIN');

    const patientResult = await client.query(
      `SELECT id
       FROM users
       WHERE id = $1 AND role = 'patient'`,
      [patientId]
    );

    if (patientResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        error: {
          code: 'PATIENT_NOT_FOUND',
          message: 'Patient not found.',
        },
      });
    }

    const hospitalResult = await client.query(
      'SELECT id FROM hospitals WHERE id = $1',
      [hospitalId]
    );

    if (hospitalResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        error: {
          code: 'HOSPITAL_NOT_FOUND',
          message: 'Hospital not found.',
        },
      });
    }

    const testsResult = await client.query(
      `SELECT id, price
       FROM lab_tests
       WHERE id = ANY($1::varchar[])
         AND is_active = TRUE`,
      [testIds]
    );

    if (testsResult.rowCount !== testIds.length) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        error: {
          code: 'INVALID_LAB_TESTS',
          message: 'One or more selected tests do not exist or are inactive.',
        },
      });
    }

    const bookingId = `LB-${Date.now()}`;

    const bookingResult = await client.query(
      `INSERT INTO lab_bookings
        (id, patient_id, hospital_id, scheduled_at, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING
         id,
         patient_id AS "patientId",
         hospital_id AS "hospitalId",
         scheduled_at AS "scheduledAt",
         status,
         notes,
         created_at AS "createdAt"`,
      [
        bookingId,
        patientId,
        hospitalId,
        appointmentDate,
        notes || null,
      ]
    );

    for (const test of testsResult.rows) {
      await client.query(
        `INSERT INTO lab_booking_tests
          (lab_booking_id, lab_test_id, price_at_booking)
         VALUES ($1, $2, $3)`,
        [bookingId, test.id, test.price]
      );
    }

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Lab booking created successfully.',
      data: {
        ...bookingResult.rows[0],
        tests: testsResult.rows.map((test) => ({
          testId: test.id,
          priceAtBooking: test.price,
        })),
        totalAmount: testsResult.rows
          .reduce((total, test) => total + Number(test.price), 0)
          .toFixed(2),
      },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});

    console.error('Create lab booking error:', error.message);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to create lab booking.',
      },
    });
  } finally {
    client.release();
  }
}


async function listLabBookings(req, res) {
  try {
    const limit = Number(req.query.limit ?? 20);
    const offset = Number(req.query.offset ?? 0);

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isInteger(offset) ||
      offset < 0
    ) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Limit must be 1-100 and offset must be 0 or greater.',
        },
      });
    }

    const isPatient = req.user.role === 'patient';
    const patientId = isPatient ? req.user.id : req.query.patientId;

    const params = [];
    let whereClause = '';

    if (patientId) {
      params.push(patientId);
      whereClause = `WHERE b.patient_id = $${params.length}`;
    }

    params.push(limit, offset);

    const result = await pool.query(
      `SELECT
         b.id,
         b.patient_id AS "patientId",
         b.hospital_id AS "hospitalId",
         h.name AS "hospitalName",
         b.scheduled_at AS "scheduledAt",
         b.status,
         b.notes,
         b.created_at AS "createdAt",
         COALESCE(
           json_agg(
             json_build_object(
               'testId', t.id,
               'testCode', t.test_code,
               'testName', t.name,
               'priceAtBooking', bt.price_at_booking
             )
           ) FILTER (WHERE t.id IS NOT NULL),
           '[]'
         ) AS tests
       FROM lab_bookings b
       JOIN hospitals h ON h.id = b.hospital_id
       LEFT JOIN lab_booking_tests bt
         ON bt.lab_booking_id = b.id
       LEFT JOIN lab_tests t ON t.id = bt.lab_test_id
       ${whereClause}
       GROUP BY b.id, h.name
       ORDER BY b.created_at DESC
       LIMIT $${params.length - 1}
       OFFSET $${params.length}`,
      params
    );

    return res.status(200).json({
      data: result.rows,
      count: result.rowCount,
      limit,
      offset,
    });
  } catch (error) {
    console.error('List lab bookings error:', error.message);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to retrieve lab bookings.',
      },
    });
  }
}

async function getLabBooking(req, res) {
  try {
    const { id } = req.params;

    const params = [id];
    let ownershipClause = '';

    if (req.user.role === 'patient') {
      params.push(req.user.id);
      ownershipClause = 'AND b.patient_id = $2';
    }

    const result = await pool.query(
      `SELECT
         b.id,
         b.patient_id AS "patientId",
         b.hospital_id AS "hospitalId",
         h.name AS "hospitalName",
         b.scheduled_at AS "scheduledAt",
         b.status,
         b.notes,
         b.created_at AS "createdAt",
         COALESCE(
           json_agg(
             json_build_object(
               'testId', t.id,
               'testCode', t.test_code,
               'testName', t.name,
               'priceAtBooking', bt.price_at_booking
             )
           ) FILTER (WHERE t.id IS NOT NULL),
           '[]'
         ) AS tests
       FROM lab_bookings b
       JOIN hospitals h ON h.id = b.hospital_id
       LEFT JOIN lab_booking_tests bt
         ON bt.lab_booking_id = b.id
       LEFT JOIN lab_tests t ON t.id = bt.lab_test_id
       WHERE b.id = $1 ${ownershipClause}
       GROUP BY b.id, h.name`,
      params
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Lab booking not found.',
        },
      });
    }

    return res.status(200).json({
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Get lab booking error:', error.message);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to retrieve lab booking.',
      },
    });
  }
}

async function updateLabBookingStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    const allowedStatuses = [
      'confirmed',
      'sample_collected',
      'processing',
      'completed',
      'cancelled',
    ];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Provide a valid booking status.',
        },
      });
    }

    const result = await pool.query(
      `UPDATE lab_bookings
       SET status = $1,
           updated_at = NOW()
       WHERE id = $2
         AND (
           (status = 'requested' AND $1 IN ('confirmed', 'cancelled'))
           OR (status = 'confirmed' AND $1 IN ('sample_collected', 'cancelled'))
           OR (status = 'sample_collected' AND $1 = 'processing')
           OR (status = 'processing' AND $1 = 'completed')
         )
       RETURNING
         id,
         patient_id AS "patientId",
         hospital_id AS "hospitalId",
         scheduled_at AS "scheduledAt",
         status,
         notes,
         updated_at AS "updatedAt"`,
      [status, id]
    );

    if (result.rowCount === 0) {
      const bookingExists = await pool.query(
        'SELECT id FROM lab_bookings WHERE id = $1',
        [id]
      );

      if (bookingExists.rowCount === 0) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Lab booking not found.',
          },
        });
      }

      return res.status(409).json({
        error: {
          code: 'INVALID_STATUS_TRANSITION',
          message: 'This booking status transition is not allowed.',
        },
      });
    }

    return res.status(200).json({
      message: 'Lab booking status updated successfully.',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update lab booking status error:', error.message);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to update lab booking status.',
      },
    });
  }
}

module.exports = {
  createLabBooking,
  listLabBookings,
  getLabBooking,
  updateLabBookingStatus,
};
