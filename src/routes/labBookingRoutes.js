
const express = require('express');
const router = express.Router();

const { authenticate, authorize } = require('../middleware/auth');

const {
  createLabBooking,
  listLabBookings,
  getLabBooking,
  updateLabBookingStatus,
} = require('../controllers/labBookingController');

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Lab Bookings
 *   description: Laboratory appointment booking
 */


/**
 * @swagger
 * /api/lab-bookings:
 *   post:
 *     summary: Create a laboratory booking
 *     description: Patients create bookings for themselves. Ops and admins can create bookings for a specified patient.
 *     tags: [Lab Bookings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - hospitalId
 *               - scheduledAt
 *               - testIds
 *             properties:
 *               patientId:
 *                 type: string
 *                 description: Required for ops/admin; ignored for patient bookings.
 *                 example: U-001
 *               hospitalId:
 *                 type: string
 *                 example: HOS-001
 *               scheduledAt:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-11-20T10:00:00+05:30"
 *               testIds:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 20
 *                 uniqueItems: true
 *                 items:
 *                   type: string
 *                 example:
 *                   - LT-001
 *                   - LT-002
 *               notes:
 *                 type: string
 *                 maxLength: 1000
 *                 example: "Routine health checkup"
 *     responses:
 *       201:
 *         description: Booking created successfully
 *       400:
 *         description: Invalid booking details
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Patient or hospital not found
 *       500:
 *         description: Internal server error
 */

router.post(
  '/',
  authorize('patient', 'ops', 'admin'),
  createLabBooking
);


/**
 * @swagger
 * /api/lab-bookings:
 *   get:
 *     summary: List laboratory bookings
 *     description: Patients can view their own bookings. Ops and admins can view bookings and optionally filter by patientId.
 *     tags: [Lab Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *         description: Filter bookings by patient ID (ops/admin only).
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *     responses:
 *       200:
 *         description: Booking history retrieved successfully
 *       400:
 *         description: Invalid pagination parameters
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get(
  '/',
  authorize('patient', 'ops', 'admin'),
  listLabBookings
);


/**
 * @swagger
 * /api/lab-bookings/{id}:
 *   get:
 *     summary: Get a laboratory booking by ID
 *     description: Patients can retrieve only their own bookings. Ops and admins can retrieve bookings by ID.
 *     tags: [Lab Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Laboratory booking ID
 *     responses:
 *       200:
 *         description: Booking retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Booking not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/:id',
  authorize('patient', 'ops', 'admin'),
  getLabBooking
);


/**
 * @swagger
 * /api/lab-bookings/{id}/status:
 *   patch:
 *     summary: Update laboratory booking status
 *     tags: [Lab Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Laboratory booking ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum:
 *                   - confirmed
 *                   - sample_collected
 *                   - processing
 *                   - completed
 *                   - cancelled
 *     responses:
 *       200:
 *         description: Booking status updated successfully
 *       400:
 *         description: Invalid status
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Booking not found
 *       409:
 *         description: Invalid status transition
 *       500:
 *         description: Internal server error
 */
router.patch(
  '/:id/status',
  authorize('ops', 'admin'),
  updateLabBookingStatus
);


module.exports = router;
