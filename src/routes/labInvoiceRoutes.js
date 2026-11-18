
const express = require('express');
const router = express.Router();

const { authenticate, authorize } = require('../middleware/auth');

const {
  createLabInvoice,
  listLabInvoices,
  getLabInvoiceById
} = require('../controllers/labInvoiceController');

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Lab Invoices
 *   description: Laboratory invoice management
 */

/**
 * @swagger
 * /api/lab-invoices/bookings/{bookingId}:
 *   post:
 *     summary: Generate an invoice for a completed lab booking
 *     tags: [Lab Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Invoice generated successfully
 *       404:
 *         description: Booking not found
 *       409:
 *         description: Booking not completed or invoice already exists
 */
router.post(
  '/bookings/:bookingId',
  authorize('ops', 'admin'),
  createLabInvoice
);

/**
 * @swagger
 * /api/lab-invoices:
 *   get:
 *     summary: Retrieve laboratory invoices
 *     tags: [Lab Invoices]
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
 *         description: Invoices retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/',
  authorize('patient', 'ops', 'admin'),
  listLabInvoices
);

/**
 * @swagger
 * /api/lab-invoices/{id}:
 *   get:
 *     summary: Retrieve invoice details and line items
 *     tags: [Lab Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Invoice ID
 *     responses:
 *       200:
 *         description: Invoice retrieved successfully
 *       404:
 *         description: Invoice not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/:id',
  authorize('patient', 'ops', 'admin'),
  getLabInvoiceById
);

module.exports = router;
