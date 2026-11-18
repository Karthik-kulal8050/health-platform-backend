let mockRole = 'patient';

jest.mock('../src/config/db', () => ({
  connect: jest.fn(),
  query: jest.fn(),
}));

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req, res, next) => {
    req.user = {
      id: 'U-001',
      role: mockRole,
    };
    next();
  },
  authorize: (...roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        },
      });
    }
    next();
  },
}));

const express = require('express');
const request = require('supertest');
const pool = require('../src/config/db');
const labBookingRoutes = require('../src/routes/labBookingRoutes');

const app = express();
app.use(express.json());
app.use('/api/lab-bookings', labBookingRoutes);

describe('Lab Booking API', () => {
  let mockClient;

  beforeEach(() => {
    mockRole = 'patient';
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    pool.connect.mockResolvedValue(mockClient);
  });

  describe('GET /api/lab-bookings', () => {
    test('should return the logged-in patient booking history', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'LB-001',
            patientId: 'U-001',
            hospitalName: 'Demo Hospital',
            status: 'requested',
            tests: [],
          },
        ],
        rowCount: 1,
      });

      const response = await request(app)
        .get('/api/lab-bookings');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].patientId).toBe('U-001');

      // Patient history must be filtered by their own user ID.
      expect(pool.query.mock.calls[0][1][0]).toBe('U-001');
    });

    test('should reject an invalid limit', async () => {
      const response = await request(app)
        .get('/api/lab-bookings?limit=200');

      expect(response.status).toBe(400);
      expect(pool.query).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/lab-bookings/:id', () => {
    test('should return a booking belonging to the patient', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'LB-001',
            patientId: 'U-001',
            status: 'requested',
            tests: [],
          },
        ],
        rowCount: 1,
      });

      const response = await request(app)
        .get('/api/lab-bookings/LB-001');

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe('LB-001');

      // Verify the query includes the logged-in patient's ID.
      expect(pool.query.mock.calls[0][1]).toEqual([
        'LB-001',
        'U-001',
      ]);
    });

    test('should return 404 when the booking does not belong to the patient', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const response = await request(app)
        .get('/api/lab-bookings/LB-OTHER');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });


  describe('POST /api/lab-bookings', () => {
    const validBooking = {
      hospitalId: 'HOS-001',
      scheduledAt: '2027-01-15T10:00:00+05:30',
      testIds: ['LT-001', 'LT-002'],
      notes: 'Synthetic test booking',
    };

    test('should create a lab booking successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 'U-001' }],
          rowCount: 1,
        }) // Patient exists
        .mockResolvedValueOnce({
          rows: [{ id: 'HOS-001' }],
          rowCount: 1,
        }) // Hospital exists
        .mockResolvedValueOnce({
          rows: [
            { id: 'LT-001', price: '350.00' },
            { id: 'LT-002', price: '600.00' },
          ],
          rowCount: 2,
        }) // Active tests
        .mockResolvedValueOnce({
          rows: [{
            id: 'LB-001',
            patientId: 'U-001',
            hospitalId: 'HOS-001',
            status: 'requested',
          }],
          rowCount: 1,
        }) // Insert booking
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Insert test 1
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Insert test 2
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      const response = await request(app)
        .post('/api/lab-bookings')
        .send(validBooking);

      expect(response.status).toBe(201);
      expect(response.body.data.id).toBe('LB-001');
      expect(response.body.data.tests).toHaveLength(2);
      expect(response.body.data.totalAmount).toBe('950.00');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/api/lab-bookings')
        .send({ hospitalId: 'HOS-001' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    test('should reject duplicate test IDs', async () => {
      const response = await request(app)
        .post('/api/lab-bookings')
        .send({
          ...validBooking,
          testIds: ['LT-001', 'LT-001'],
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    test('should reject a past appointment date', async () => {
      const response = await request(app)
        .post('/api/lab-bookings')
        .send({
          ...validBooking,
          scheduledAt: '2020-01-01T10:00:00+05:30',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    test('should reject inactive or unknown lab tests', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 'U-001' }],
          rowCount: 1,
        }) // Patient exists
        .mockResolvedValueOnce({
          rows: [{ id: 'HOS-001' }],
          rowCount: 1,
        }) // Hospital exists
        .mockResolvedValueOnce({
          rows: [{ id: 'LT-001', price: '350.00' }],
          rowCount: 1,
        }) // Only one of two tests found
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ROLLBACK

      const response = await request(app)
        .post('/api/lab-bookings')
        .send(validBooking);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_LAB_TESTS');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('should rollback transaction if booking insertion fails', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 'U-001' }],
          rowCount: 1,
        }) // Patient exists
        .mockResolvedValueOnce({
          rows: [{ id: 'HOS-001' }],
          rowCount: 1,
        }) // Hospital exists
        .mockResolvedValueOnce({
          rows: [
            { id: 'LT-001', price: '350.00' },
            { id: 'LT-002', price: '600.00' },
          ],
          rowCount: 2,
        }) // Active tests
        .mockRejectedValueOnce(new Error('Database insertion failed')) // Insert booking
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ROLLBACK

      const response = await request(app)
        .post('/api/lab-bookings')
        .send(validBooking);

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });


  describe('PATCH /api/lab-bookings/:id/status', () => {
    test('should update booking status successfully for ops', async () => {
      mockRole = 'ops';

      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'LB-001',
          patientId: 'U-001',
          status: 'confirmed',
        }],
        rowCount: 1,
      });

      const response = await request(app)
        .patch('/api/lab-bookings/LB-001/status')
        .send({ status: 'confirmed' });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('confirmed');
      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    test('should reject an invalid status value', async () => {
      mockRole = 'ops';

      const response = await request(app)
        .patch('/api/lab-bookings/LB-001/status')
        .send({ status: 'unknown' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(pool.query).not.toHaveBeenCalled();
    });

    test('should return 409 for an invalid status transition', async () => {
      mockRole = 'ops';

      pool.query
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        }) // Update rejected by transition condition
        .mockResolvedValueOnce({
          rows: [{ id: 'LB-001' }],
          rowCount: 1,
        }); // Booking exists

      const response = await request(app)
        .patch('/api/lab-bookings/LB-001/status')
        .send({ status: 'completed' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    test('should return 404 for an unknown booking', async () => {
      mockRole = 'ops';

      pool.query
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        }) // Update found no eligible booking
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        }); // Booking does not exist

      const response = await request(app)
        .patch('/api/lab-bookings/INVALID/status')
        .send({ status: 'confirmed' });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    test('should prevent patients from updating booking status', async () => {
      mockRole = 'patient';

      const response = await request(app)
        .patch('/api/lab-bookings/LB-001/status')
        .send({ status: 'confirmed' });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(pool.query).not.toHaveBeenCalled();
    });
  });

});
