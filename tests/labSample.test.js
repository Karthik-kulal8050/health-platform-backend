
let mockRole = 'ops';

jest.mock('../src/config/db', () => ({
  connect: jest.fn(),
  query: jest.fn(),
}));

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req, res, next) => {
    req.user = {
      id: 'U-OPS-001',
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
const labSampleRoutes = require('../src/routes/labSampleRoutes');

const app = express();
app.use(express.json());
app.use('/api/lab-samples', labSampleRoutes);

describe('Lab Sample API', () => {
  let mockClient;

  beforeEach(() => {
    mockRole = 'ops';
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    pool.connect.mockResolvedValue(mockClient);
  });

  describe('POST /api/lab-samples/bookings/:bookingId/samples', () => {
    test('should create a sample and generate a barcode', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 'LB-001', status: 'confirmed' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [
            { id: '1', sampleType: 'Blood' },
            { id: '2', sampleType: 'Blood' },
          ],
          rowCount: 2,
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'LS-TEST123',
            bookingId: 'LB-001',
            barcode: 'LAB-TEST123',
            sampleType: 'Blood',
            status: 'collected',
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // booking update
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      const response = await request(app)
        .post('/api/lab-samples/bookings/LB-001/samples')
        .send({
          sampleType: 'Blood',
          labBookingTestIds: [1, 2],
          notes: 'Test sample',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.barcode).toBeTruthy();
      expect(response.body.data.status).toBe('collected');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('should reject patients from creating samples', async () => {
      mockRole = 'patient';

      const response = await request(app)
        .post('/api/lab-samples/bookings/LB-001/samples')
        .send({
          sampleType: 'Blood',
          labBookingTestIds: [1],
        });

      expect(response.status).toBe(403);
      expect(pool.connect).not.toHaveBeenCalled();
    });

    test('should reject an empty test ID array', async () => {
      const response = await request(app)
        .post('/api/lab-samples/bookings/LB-001/samples')
        .send({
          sampleType: 'Blood',
          labBookingTestIds: [],
        });

      expect(response.status).toBe(400);
      expect(pool.connect).not.toHaveBeenCalled();
    });

    test('should return 404 when booking does not exist', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await request(app)
        .post('/api/lab-samples/bookings/LB-999/samples')
        .send({
          sampleType: 'Blood',
          labBookingTestIds: [1],
        });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('BOOKING_NOT_FOUND');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('should reject tests that do not belong to the booking', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({
          rows: [{ id: 'LB-001', status: 'confirmed' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{ id: '1', sampleType: 'Blood' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await request(app)
        .post('/api/lab-samples/bookings/LB-001/samples')
        .send({
          sampleType: 'Blood',
          labBookingTestIds: [1, 2],
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_BOOKING_TESTS');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('GET /api/lab-samples/barcode/:barcode', () => {
    test('should retrieve a sample using its barcode', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'LS-001',
          barcode: 'LAB-001',
          patientId: 'U-001',
          status: 'collected',
          tests: [],
        }],
        rowCount: 1,
      });

      const response = await request(app)
        .get('/api/lab-samples/barcode/LAB-001');

      expect(response.status).toBe(200);
      expect(response.body.data.barcode).toBe('LAB-001');
    });

    test('should return 404 for an unknown barcode', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const response = await request(app)
        .get('/api/lab-samples/barcode/UNKNOWN');

      expect(response.status).toBe(404);
    });

    test('should restrict patient lookup to their own bookings', async () => {
      mockRole = 'patient';

      pool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const response = await request(app)
        .get('/api/lab-samples/barcode/LAB-001');

      expect(response.status).toBe(404);
      expect(pool.query.mock.calls[0][1]).toEqual([
        'LAB-001',
        'U-OPS-001',
      ]);
    });
  });

  describe('PATCH /api/lab-samples/:id/status', () => {
    test('should update sample status successfully', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'LS-001',
          status: 'received',
        }],
        rowCount: 1,
      });

      const response = await request(app)
        .patch('/api/lab-samples/LS-001/status')
        .send({ status: 'received' });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('received');
    });

    test('should reject an invalid sample status', async () => {
      const response = await request(app)
        .patch('/api/lab-samples/LS-001/status')
        .send({ status: 'unknown' });

      expect(response.status).toBe(400);
      expect(pool.query).not.toHaveBeenCalled();
    });

    test('should return 404 when sample does not exist', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await request(app)
        .patch('/api/lab-samples/LS-999/status')
        .send({ status: 'received' });

      expect(response.status).toBe(404);
    });

    test('should reject invalid status transitions', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({
          rows: [{ id: 'LS-001' }],
          rowCount: 1,
        });

      const response = await request(app)
        .patch('/api/lab-samples/LS-001/status')
        .send({ status: 'received' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    test('should reject patients from updating sample status', async () => {
      mockRole = 'patient';

      const response = await request(app)
        .patch('/api/lab-samples/LS-001/status')
        .send({ status: 'received' });

      expect(response.status).toBe(403);
      expect(pool.query).not.toHaveBeenCalled();
    });
  });
});
