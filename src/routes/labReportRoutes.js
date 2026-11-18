
const express = require('express');
const router = express.Router();

const { authenticate, authorize } = require('../middleware/auth');

const {
  uploadLabReport,
  listLabReports,
  downloadLabReport
} = require('../controllers/labReportController');

const {
  handleLabReportUpload,
  validatePdfSignature,
} = require('../middleware/labReportUpload');


router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Lab Reports
 *   description: Laboratory report uploads and health-record linkage
 */

/**
 * @swagger
 * /api/lab-reports/bookings/{bookingId}:
 *   post:
 *     summary: Upload a laboratory report
 *     description: Uploads a PDF report for a booking in processing status and automatically creates a linked patient health record.
 *     tags: [Lab Reports]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - report
 *             properties:
 *               report:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Laboratory report uploaded successfully
 *       400:
 *         description: Invalid PDF upload
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Lab booking not found
 *       409:
 *         description: Booking is not in processing status
 *       413:
 *         description: PDF exceeds the 5 MB limit
 *       500:
 *         description: Internal server error
 */
router.post(
  '/bookings/:bookingId',
  authorize('ops', 'admin'),
  handleLabReportUpload,
  validatePdfSignature,
  uploadLabReport
);

/**
 * @swagger
 * /api/lab-reports:
 *   get:
 *     summary: Retrieve laboratory reports
 *     tags: [Lab Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *         description: Optional patient filter for ops/admin
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Laboratory reports retrieved successfully
 */
router.get(
  '/',
  authorize('patient', 'ops', 'admin'),
  listLabReports
);


/**
 * @swagger
 * /api/lab-reports/{id}/download:
 *   get:
 *     summary: Download a laboratory report PDF
 *     description: Patients can download their own reports. Ops and admins can download any available report.
 *     tags: [Lab Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Laboratory report ID
 *     responses:
 *       200:
 *         description: PDF report downloaded successfully
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Report not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/:id/download',
  authorize('patient', 'ops', 'admin'),
  downloadLabReport
);

module.exports = router;
