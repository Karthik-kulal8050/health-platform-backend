
const express = require('express');

const {
  createBooking,
  createGuestBooking,
  getBooking,
  listBookings,
  updateBookingStatus,
} = require('../controllers/bookingController');

const {
  uploadEmergencyPhoto,
} = require('../controllers/photoController');

const {
  handleEmergencyPhotoUpload,
  validateImageSignature,
} = require('../middleware/emergencyPhotoUpload');

const { authenticate } = require('../middleware/auth');

const router = express.Router();


/**
 * @swagger
 * /api/bookings/guest:
 *   post:
 *     summary: Create a guest emergency booking
 *     tags: [Bookings]
 *     description: Creates an emergency booking without requiring user authentication.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - emergencyType
 *               - pickupLat
 *               - pickupLng
 *               - contactNumber
 *               - incidentSeverity
 *               - patientCondition
 *             properties:
 *               emergencyType:
 *                 type: string
 *                 enum: [cardiac, trauma, stroke, maternity, breathing, burns, general]
 *                 example: trauma
 *               pickupLat:
 *                 type: number
 *                 example: 26.75
 *               pickupLng:
 *                 type: number
 *                 example: 83.38
 *               contactNumber:
 *                 type: string
 *                 example: "9876543210"
 *               incidentSeverity:
 *                 type: string
 *                 enum: [critical, high, moderate, low]
 *                 example: critical
 *               patientCondition:
 *                 type: string
 *                 example: Patient injured in a road accident
 *     responses:
 *       201:
 *         description: Guest emergency booking created
 *       400:
 *         description: Invalid booking details
 *       500:
 *         description: Internal server error
 */
router.post('/guest', createGuestBooking);


// Photo upload uses a temporary secret token for authorization.
// The booking ID does not need to be exposed in the URL.

/**
 * @swagger
 * /api/bookings/photos/{purpose}:
 *   post:
 *     summary: Upload an emergency photo
 *     tags: [Bookings]
 *     description: Uploads a security or incident photo using a one-time upload token.
 *     parameters:
 *       - in: path
 *         name: purpose
 *         required: true
 *         schema:
 *           type: string
 *           enum: [security, incident]
 *       - in: header
 *         name: X-Upload-Token
 *         required: true
 *         schema:
 *           type: string
 *           example: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - photo
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Photo uploaded successfully
 *       400:
 *         description: Invalid photo or upload details
 *       401:
 *         description: Invalid, expired, or consumed upload token
 *       409:
 *         description: Photo already uploaded
 *       413:
 *         description: Photo exceeds the 5 MB limit
 */
router.post(
  '/photos/:purpose',
  handleEmergencyPhotoUpload,
  validateImageSignature,
  uploadEmergencyPhoto
);


// All remaining booking routes require authentication.
router.use(authenticate);

router.post('/', createBooking);
router.get('/', listBookings);
router.get('/:id', getBooking);
router.patch('/:id/status', updateBookingStatus);

module.exports = router;
