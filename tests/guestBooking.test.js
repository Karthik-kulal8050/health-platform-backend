
jest.mock('../src/config/db', () => ({
  connect: jest.fn(),
  query: jest.fn(),
}));

jest.mock('../src/services/aiClient', () => ({
  haversineDistanceKm: jest.fn(() => 1),
  recommendAmbulance: jest.fn(),
  estimateEta: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(() => ({ sub: 'U-001', role: 'ops' })),
}));

const express = require('express');
const request = require('supertest');
const pool = require('../src/config/db');
const {
  recommendAmbulance,
  estimateEta,
} = require('../src/services/aiClient');
const bookingRoutes = require('../src/routes/bookingRoutes');

process.env.JWT_SECRET = 'test-only-secret-for-jest';
process.env.AI_MODE = 'mock';

const app = express();
app.use(express.json());
app.use('/api/bookings', bookingRoutes);

describe('Guest emergency booking', () => {
  let client;

  const guestBooking = {
    id: 'BK-GUEST-01',
    patient_id: null,
    emergency_type: 'trauma',
    pickup_lat: 26.75,
    pickup_lng: 83.38,
    contact_number: '9876543210',
    incident_severity: 'critical',
    patient_condition: 'Patient injured in a road accident',
    incident_photo_path: null,
    security_photo_path: null,
    ambulance_id: null,
    hospital_id: null,
    status: 'requested',
    eta_minutes: null,
    ai_status: 'pending',
    recommendation_reason: null,
    created_at: new Date('2026-11-15T08:00:00Z'),
    updated_at: new Date('2026-11-15T08:00:00Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    client = {
      query: jest.fn(async (sql) => {
        if (
          sql === 'BEGIN' ||
          sql === 'COMMIT' ||
          sql === 'ROLLBACK'
        ) {
          return { rows: [], rowCount: 0 };
        }

        if (sql.includes('INSERT INTO booking_upload_tokens')) {
            return { rows: [{ id: 1 }], rowCount: 1 };
        }

        if (sql.includes('INSERT INTO bookings')) {
          return { rows: [guestBooking], rowCount: 1 };
        }

        throw new Error(`Unexpected client query: ${sql}`);
      }),
      release: jest.fn(),
    };

    pool.connect.mockResolvedValue(client);

    pool.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM ambulances')) {
        return { rows: [], rowCount: 0 };
      }

      if (sql.includes('FROM hospitals')) {
        return { rows: [], rowCount: 0 };
      }

      if (sql.includes('UPDATE bookings')) {
        return {
          rows: [{
            ...guestBooking,
            ai_status: 'fallback',
          }],
          rowCount: 1,
        };
      }

      throw new Error(`Unexpected pool query: ${sql}`);
    });

    recommendAmbulance.mockResolvedValue(null);
    estimateEta.mockResolvedValue(null);
  });

  test('creates a guest booking without authentication', async () => {
    const response = await request(app)
      .post('/api/bookings/guest')
      .send({
        emergencyType: 'trauma',
        pickupLat: 26.75,
        pickupLng: 83.38,
        contactNumber: '9876543210',
        incidentSeverity: 'critical',
        patientCondition: 'Patient injured in a road accident',
      });

    expect(response.status).toBe(201);
    expect(response.body.uploadTokens).toBeDefined();
    expect(response.body.uploadTokens.security).toMatch(
    /^[a-f0-9]{64}$/
    );
    expect(response.body.data).toBeDefined();
    expect(response.body.data.patientId).toBeNull();
    expect(response.body.data.contactNumber).toBe('9876543210');
    expect(response.body.data.incidentSeverity).toBe('critical');
    expect(response.body.data.patientCondition).toBe(
      'Patient injured in a road accident'
    );
    expect(response.body.data.securityPhotoPath).toBeNull();
  });

  test('rejects an invalid contact number', async () => {
    const response = await request(app)
      .post('/api/bookings/guest')
      .send({
        emergencyType: 'trauma',
        pickupLat: 26.75,
        pickupLng: 83.38,
        contactNumber: '123',
        incidentSeverity: 'critical',
        patientCondition: 'Patient is injured',
      });

    expect(response.status).toBe(400);
  });

  test('rejects an invalid incident severity', async () => {
    const response = await request(app)
      .post('/api/bookings/guest')
      .send({
        emergencyType: 'trauma',
        pickupLat: 26.75,
        pickupLng: 83.38,
        contactNumber: '9876543210',
        incidentSeverity: 'extreme',
        patientCondition: 'Patient is injured',
      });

    expect(response.status).toBe(400);
  });

  test('rejects a missing patient condition', async () => {
    const response = await request(app)
      .post('/api/bookings/guest')
      .send({
        emergencyType: 'trauma',
        pickupLat: 26.75,
        pickupLng: 83.38,
        contactNumber: '9876543210',
        incidentSeverity: 'critical',
      });

    expect(response.status).toBe(400);
  });


  test('rejects a guest booking with an ambulance ID', async () => {
    const response = await request(app)
      .post('/api/bookings/guest')
      .send({
        emergencyType: 'trauma',
        pickupLat: 26.75,
        pickupLng: 83.38,
        contactNumber: '9876543210',
        incidentSeverity: 'critical',
        patientCondition: 'Patient is injured',
        ambulanceId: 'AMB-001',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');

    // The request must be rejected before accessing the database.
    expect(pool.connect).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('rejects a guest booking with a hospital ID', async () => {
    const response = await request(app)
      .post('/api/bookings/guest')
      .send({
        emergencyType: 'trauma',
        pickupLat: 26.75,
        pickupLng: 83.38,
        contactNumber: '9876543210',
        incidentSeverity: 'critical',
        patientCondition: 'Patient is injured',
        hospitalId: 'HOS-001',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');

    // The request must be rejected before accessing the database.
    expect(pool.connect).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });
});
