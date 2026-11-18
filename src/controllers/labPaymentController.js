
const crypto = require('crypto');
const pool = require('../config/db');

async function createSandboxPayment(req, res) {
  let client;

  try {
    const { invoiceId } = req.params;
    const { paymentMethod } = req.body || {};

    const allowedMethods = [
      'sandbox_card',
      'sandbox_upi',
      'sandbox_netbanking'
    ];

    if (!allowedMethods.includes(paymentMethod)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PAYMENT_METHOD',
          message: 'Choose a valid sandbox payment method.'
        }
      });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const invoiceResult = await client.query(
      `SELECT id, patient_id, total_amount, status
       FROM lab_invoices
       WHERE id = $1
       FOR UPDATE`,
      [invoiceId]
    );

    const invoice = invoiceResult.rows[0];

    if (!invoice) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: {
          code: 'INVOICE_NOT_FOUND',
          message: 'Lab invoice not found.'
        }
      });
    }

    if (
      req.user.role === 'patient' &&
      invoice.patient_id !== req.user.id
    ) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: {
          code: 'INVOICE_NOT_FOUND',
          message: 'Lab invoice not found.'
        }
      });
    }

    if (invoice.status !== 'issued') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: {
          code: 'INVOICE_NOT_PAYABLE',
          message: 'This invoice is not available for payment.'
        }
      });
    }

    const paymentId =
      `PAY-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

    const providerReference =
      `SANDBOX-${crypto.randomBytes(10).toString('hex').toUpperCase()}`;

    const paymentResult = await client.query(
      `INSERT INTO lab_payments
       (id, invoice_id, patient_id, provider_reference,
        amount, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING
         id,
         invoice_id AS "invoiceId",
         patient_id AS "patientId",
         provider,
         provider_reference AS "providerReference",
         amount,
         currency,
         payment_method AS "paymentMethod",
         status,
         created_at AS "createdAt"`,
      [
        paymentId,
        invoice.id,
        invoice.patient_id,
        providerReference,
        invoice.total_amount,
        paymentMethod
      ]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Sandbox payment initiated successfully.',
      data: paymentResult.rows[0]
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }

    console.error('Create sandbox payment error:', error);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unable to initiate sandbox payment.'
      }
    });
  } finally {
    if (client) client.release();
  }
}


async function processSandboxPaymentResult(req, res) {
  let client;

  try {
    const { id } = req.params;
    const { outcome } = req.body || {};

    const allowedOutcomes = [
      'succeeded',
      'failed',
      'cancelled'
    ];

    if (!allowedOutcomes.includes(outcome)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PAYMENT_OUTCOME',
          message: 'Outcome must be succeeded, failed, or cancelled.'
        }
      });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const paymentResult = await client.query(
      `SELECT
         p.id,
         p.invoice_id,
         p.patient_id,
         p.amount,
         p.status,
         i.status AS invoice_status
       FROM lab_payments p
       JOIN lab_invoices i ON i.id = p.invoice_id
       WHERE p.id = $1
       FOR UPDATE OF p, i`,
      [id]
    );

    const payment = paymentResult.rows[0];

    if (!payment) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: {
          code: 'PAYMENT_NOT_FOUND',
          message: 'Sandbox payment not found.'
        }
      });
    }

    if (payment.status !== 'initiated') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: {
          code: 'PAYMENT_ALREADY_PROCESSED',
          message: 'This payment has already been processed.'
        }
      });
    }

    if (
      outcome === 'succeeded' &&
      payment.invoice_status !== 'issued'
    ) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: {
          code: 'INVOICE_NOT_PAYABLE',
          message: 'This invoice is no longer available for payment.'
        }
      });
    }

    const updatedPayment = await client.query(
      `UPDATE lab_payments
       SET status = $1,
           updated_at = NOW(),
           completed_at = NOW()
       WHERE id = $2
       RETURNING
         id,
         invoice_id AS "invoiceId",
         patient_id AS "patientId",
         amount,
         currency,
         payment_method AS "paymentMethod",
         status,
         completed_at AS "completedAt"`,
      [outcome, id]
    );

    if (outcome === 'succeeded') {
      await client.query(
        `UPDATE lab_invoices
         SET status = 'paid',
             updated_at = NOW()
         WHERE id = $1`,
        [payment.invoice_id]
      );
    }

    await client.query('COMMIT');

    return res.status(200).json({
      message: `Sandbox payment ${outcome} successfully.`,
      data: updatedPayment.rows[0]
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }

    console.error('Process sandbox payment error:', error);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unable to process sandbox payment result.'
      }
    });
  } finally {
    if (client) client.release();
  }
}


async function listLabPayments(req, res) {
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
        invoice_id AS "invoiceId",
        patient_id AS "patientId",
        provider,
        provider_reference AS "providerReference",
        amount,
        currency,
        payment_method AS "paymentMethod",
        status,
        created_at AS "createdAt",
        completed_at AS "completedAt"
      FROM lab_payments
      ${whereClause}
      ORDER BY created_at DESC
      `,
      values
    );

    return res.status(200).json({
      message: 'Lab payment history retrieved successfully.',
      data: result.rows
    });
  } catch (error) {
    console.error('List lab payments error:', error);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unable to retrieve lab payment history.'
      }
    });
  }
}

module.exports = {
  createSandboxPayment,
  processSandboxPaymentResult,
  listLabPayments
};
