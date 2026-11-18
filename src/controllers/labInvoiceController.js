
const crypto = require('crypto');
const pool = require('../config/db');

async function createLabInvoice(req, res) {
  let client;

  try {
    const { bookingId } = req.params;

    client = await pool.connect();
    await client.query('BEGIN');

    // Lock and verify the completed booking.
    const bookingResult = await client.query(
      `SELECT id, patient_id, status
       FROM lab_bookings
       WHERE id = $1
       FOR UPDATE`,
      [bookingId]
    );

    const booking = bookingResult.rows[0];

    if (!booking) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: {
          code: 'BOOKING_NOT_FOUND',
          message: 'Lab booking not found.'
        }
      });
    }

    if (booking.status !== 'completed') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: {
          code: 'BOOKING_NOT_COMPLETED',
          message: 'Invoice can only be generated for completed bookings.'
        }
      });
    }

    // Prevent duplicate invoices.
    const existingInvoice = await client.query(
      `SELECT id
       FROM lab_invoices
       WHERE booking_id = $1`,
      [bookingId]
    );

    if (existingInvoice.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: {
          code: 'INVOICE_ALREADY_EXISTS',
          message: 'An invoice already exists for this booking.'
        }
      });
    }

    // Fetch booking tests and their saved prices.
    const testsResult = await client.query(
      `SELECT
         lbt.id AS booking_test_id,
         lbt.price_at_booking,
         lt.name AS test_name,
         lt.sample_type
       FROM lab_booking_tests lbt
       JOIN lab_tests lt ON lt.id = lbt.lab_test_id
       WHERE lbt.lab_booking_id = $1
       ORDER BY lbt.id`,
      [bookingId]
    );

    if (testsResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: {
          code: 'NO_BOOKING_TESTS',
          message: 'No tests found for this booking.'
        }
      });
    }

    const invoiceId =
      `INV-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

    const subtotal = testsResult.rows.reduce(
      (sum, test) => sum + Number(test.price_at_booking),
      0
    );

    // No tax is applied in this synthetic sandbox implementation.
    const taxAmount = 0;
    const totalAmount = subtotal + taxAmount;

    await client.query(
      `INSERT INTO lab_invoices
       (id, booking_id, patient_id, subtotal, tax_amount, total_amount)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        invoiceId,
        bookingId,
        booking.patient_id,
        subtotal.toFixed(2),
        taxAmount.toFixed(2),
        totalAmount.toFixed(2)
      ]
    );

    for (const test of testsResult.rows) {
      const unitPrice = Number(test.price_at_booking);

      await client.query(
        `INSERT INTO lab_invoice_items
         (invoice_id, lab_booking_test_id, test_name,
          sample_type, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          invoiceId,
          test.booking_test_id,
          test.test_name,
          test.sample_type,
          1,
          unitPrice.toFixed(2),
          unitPrice.toFixed(2)
        ]
      );
    }

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Lab invoice generated successfully.',
      data: {
        id: invoiceId,
        bookingId,
        patientId: booking.patient_id,
        subtotal: subtotal.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        status: 'issued',
        items: testsResult.rows.map(test => ({
          testName: test.test_name,
          sampleType: test.sample_type,
          quantity: 1,
          unitPrice: Number(test.price_at_booking).toFixed(2),
          lineTotal: Number(test.price_at_booking).toFixed(2)
        }))
      }
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }

    console.error('Create lab invoice error:', error);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unable to generate lab invoice.'
      }
    });
  } finally {
    if (client) client.release();
  }
}


async function listLabInvoices(req, res) {
  try {
    const values = [];
    let whereClause = '';

    if (req.user.role === 'patient') {
      values.push(req.user.id);
      whereClause = 'WHERE patient_id = $1';
    } else if (req.query.patientId) {
      values.push(req.query.patientId);
      whereClause = 'WHERE patient_id = $1';
    }

    const result = await pool.query(
      `
      SELECT
        id,
        booking_id AS "bookingId",
        patient_id AS "patientId",
        subtotal,
        tax_amount AS "taxAmount",
        total_amount AS "totalAmount",
        status,
        issued_at AS "issuedAt"
      FROM lab_invoices
      ${whereClause}
      ORDER BY issued_at DESC
      `,
      values
    );

    return res.status(200).json({
      message: 'Lab invoices retrieved successfully.',
      data: result.rows
    });
  } catch (error) {
    console.error('List lab invoices error:', error);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unable to retrieve lab invoices.'
      }
    });
  }
}

async function getLabInvoiceById(req, res) {
  try {
    const values = [req.params.id];
    let ownershipClause = '';

    if (req.user.role === 'patient') {
      values.push(req.user.id);
      ownershipClause = 'AND patient_id = $2';
    }

    const invoiceResult = await pool.query(
      `
      SELECT
        id,
        booking_id AS "bookingId",
        patient_id AS "patientId",
        subtotal,
        tax_amount AS "taxAmount",
        total_amount AS "totalAmount",
        status,
        issued_at AS "issuedAt"
      FROM lab_invoices
      WHERE id = $1
      ${ownershipClause}
      `,
      values
    );

    const invoice = invoiceResult.rows[0];

    if (!invoice) {
      return res.status(404).json({
        error: {
          code: 'INVOICE_NOT_FOUND',
          message: 'Lab invoice not found.'
        }
      });
    }

    const itemsResult = await pool.query(
      `
      SELECT
        id,
        test_name AS "testName",
        sample_type AS "sampleType",
        quantity,
        unit_price AS "unitPrice",
        line_total AS "lineTotal"
      FROM lab_invoice_items
      WHERE invoice_id = $1
      ORDER BY id
      `,
      [invoice.id]
    );

    return res.status(200).json({
      message: 'Lab invoice retrieved successfully.',
      data: {
        ...invoice,
        items: itemsResult.rows
      }
    });
  } catch (error) {
    console.error('Get lab invoice error:', error);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unable to retrieve lab invoice.'
      }
    });
  }
}

module.exports = {
  createLabInvoice,
  listLabInvoices,
  getLabInvoiceById
};
