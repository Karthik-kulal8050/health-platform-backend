
const express = require('express');
const router = express.Router();

const { authenticate, authorize } = require('../middleware/auth');

const {
  createLabSample,
  getLabSampleByBarcode,
  updateLabSampleStatus,
} = require('../controllers/labSampleController');

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Lab Samples
 *   description: Laboratory sample collection and barcode tracking
 */

/**
 * @swagger
 * /api/lab-samples/bookings/{bookingId}/samples:
 *   post:
 *     summary: Create a laboratory sample
 *     tags: [Lab Samples]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
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
 *               - sampleType
 *               - labBookingTestIds
 *             properties:
 *               sampleType:
 *                 type: string
 *                 example: Blood
 *               labBookingTestIds:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 20
 *                 items:
 *                   type: integer
 *                 example: [1, 2]
 *               notes:
 *                 type: string
 *                 maxLength: 1000
 *                 example: Sample collected successfully
 *     responses:
 *       201:
 *         description: Sample created and barcode generated
 *       400:
 *         description: Invalid sample details
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Booking not found
 *       409:
 *         description: Booking is not eligible for sample collection
 *       500:
 *         description: Internal server error
 */
router.post(
  '/bookings/:bookingId/samples',
  authorize('ops', 'admin'),
  createLabSample
);

/**
 * @swagger
 * /api/lab-samples/barcode/{barcode}:
 *   get:
 *     summary: Retrieve a sample using its barcode
 *     tags: [Lab Samples]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: barcode
 *         required: true
 *         schema:
 *           type: string
 *         description: Generated sample barcode
 *     responses:
 *       200:
 *         description: Sample details retrieved successfully
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Sample not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/barcode/:barcode',
  authorize('patient', 'ops', 'admin'),
  getLabSampleByBarcode
);

/**
 * @swagger
 * /api/lab-samples/{id}/status:
 *   patch:
 *     summary: Update laboratory sample status
 *     tags: [Lab Samples]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Laboratory sample ID
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
 *                   - received
 *                   - processing
 *                   - processed
 *                   - rejected
 *     responses:
 *       200:
 *         description: Sample status updated successfully
 *       400:
 *         description: Invalid status
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Sample not found
 *       409:
 *         description: Invalid status transition
 *       500:
 *         description: Internal server error
 */
router.patch(
  '/:id/status',
  authorize('ops', 'admin'),
  updateLabSampleStatus
);

module.exports = router;