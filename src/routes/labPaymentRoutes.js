
const express = require('express');
const router = express.Router();

const { authenticate, authorize } = require('../middleware/auth');

const {
  createSandboxPayment,
  processSandboxPaymentResult,
  listLabPayments
} = require('../controllers/labPaymentController');

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Lab Payments
 *   description: Sandbox laboratory payment management
 */

/**
 * @swagger
 * /api/lab-payments/invoices/{invoiceId}:
 *   post:
 *     summary: Initiate a sandbox payment
 *     tags: [Lab Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentMethod
 *             properties:
 *               paymentMethod:
 *                 type: string
 *                 enum:
 *                   - sandbox_card
 *                   - sandbox_upi
 *                   - sandbox_netbanking
 *     responses:
 *       201:
 *         description: Sandbox payment initiated
 *       400:
 *         description: Invalid payment method
 *       404:
 *         description: Invoice not found
 *       409:
 *         description: Invoice is not payable
 */
router.post(
  '/invoices/:invoiceId',
  authorize('patient', 'ops', 'admin'),
  createSandboxPayment
);

/**
 * @swagger
 * /api/lab-payments/{id}/sandbox-result:
 *   post:
 *     summary: Simulate a sandbox payment result
 *     tags: [Lab Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - outcome
 *             properties:
 *               outcome:
 *                 type: string
 *                 enum: [succeeded, failed, cancelled]
 *     responses:
 *       200:
 *         description: Sandbox payment result processed
 *       404:
 *         description: Payment not found
 *       409:
 *         description: Payment already processed
 */
router.post(
  '/:id/sandbox-result',
  authorize('ops', 'admin'),
  processSandboxPaymentResult
);

/**
 * @swagger
 * /api/lab-payments:
 *   get:
 *     summary: Retrieve laboratory payment history
 *     tags: [Lab Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *         description: Optional patient filter for ops/admin
 *     responses:
 *       200:
 *         description: Payment history retrieved successfully
 */
router.get(
  '/',
  authorize('patient', 'ops', 'admin'),
  listLabPayments
);

module.exports = router;
