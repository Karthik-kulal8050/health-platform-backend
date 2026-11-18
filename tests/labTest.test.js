
jest.mock('../src/utils/query', () => ({
  query: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const { query } = require('../src/utils/query');
const labTestRoutes = require('../src/routes/labTestRoutes');

const app = express();
app.use(express.json());
app.use('/api/lab-tests', labTestRoutes);

describe('Lab Test API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/lab-tests', () => {
    test('should return all active lab tests', async () => {
      query
        .mockResolvedValueOnce({
          rows: [{ count: 2 }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'LT-001',
              testCode: 'CBC',
              name: 'Complete Blood Count',
              price: '350.00',
            },
            {
              id: 'LT-002',
              testCode: 'LIPID',
              name: 'Lipid Profile',
              price: '600.00',
            },
          ],
        });

      const response = await request(app)
        .get('/api/lab-tests');

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(2);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].testCode).toBe('CBC');
    });

    test('should search lab tests by name or code', async () => {
      query
        .mockResolvedValueOnce({
          rows: [{ count: 1 }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'LT-001',
              testCode: 'CBC',
              name: 'Complete Blood Count',
            },
          ],
        });

      const response = await request(app)
        .get('/api/lab-tests?search=CBC');

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(1);
      expect(response.body.data[0].testCode).toBe('CBC');
    });

    test('should filter by sample type', async () => {
      query
        .mockResolvedValueOnce({
          rows: [{ count: 1 }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'LT-005',
              sampleType: 'Urine',
            },
          ],
        });

      const response = await request(app)
        .get('/api/lab-tests?sampleType=Urine');

      expect(response.status).toBe(200);
      expect(response.body.data[0].sampleType).toBe('Urine');
    });

    test('should reject invalid limit', async () => {
      const response = await request(app)
        .get('/api/lab-tests?limit=200');

      expect(response.status).toBe(400);
      expect(query).not.toHaveBeenCalled();
    });

    test('should reject invalid offset', async () => {
      const response = await request(app)
        .get('/api/lab-tests?offset=-1');

      expect(response.status).toBe(400);
      expect(query).not.toHaveBeenCalled();
    });

    test('should return 500 if database query fails', async () => {
      query.mockRejectedValueOnce(new Error('Database error'));

      const response = await request(app)
        .get('/api/lab-tests');

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('GET /api/lab-tests/:id', () => {
    test('should return a lab test by ID', async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            id: 'LT-001',
            testCode: 'CBC',
            name: 'Complete Blood Count',
          },
        ],
      });

      const response = await request(app)
        .get('/api/lab-tests/LT-001');

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe('LT-001');
    });

    test('should return 404 for an unknown test ID', async () => {
      query.mockResolvedValueOnce({
        rows: [],
      });

      const response = await request(app)
        .get('/api/lab-tests/INVALID');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    test('should return 500 if database query fails', async () => {
      query.mockRejectedValueOnce(new Error('Database error'));

      const response = await request(app)
        .get('/api/lab-tests/LT-001');

      expect(response.status).toBe(500);
    });
  });
});
