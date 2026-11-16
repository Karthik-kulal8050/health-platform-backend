
jest.mock('../src/config/db', () => ({
  connect: jest.fn(),
  query: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const fs = require('fs/promises');
const path = require('path');
const pool = require('../src/config/db');

const bookingRoutes = require('../src/routes/bookingRoutes');

const app = express();
app.use(express.json());
app.use('/api/bookings', bookingRoutes);

describe('Emergency photo upload', () => {
  let client;

  const jpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0,
    0x00, 0x10, 0x4a, 0x46,
    0x49, 0x46, 0x00, 0x01,
  ]);

  beforeEach(() => {
    jest.clearAllMocks();

    client = {
      query: jest.fn(),
      release: jest.fn(),
    };

    pool.connect.mockResolvedValue(client);
  });

  test('handles database connection failure gracefully', async () => {
    // Simulate PostgreSQL being unavailable.
    pool.connect.mockRejectedValueOnce(
      new Error('Database connection failed')
    );

    const response = await request(app)
      .post('/api/bookings/photos/security')
      .set('X-Upload-Token', 'f'.repeat(64))
      .attach('photo', jpegBuffer, {
        filename: 'security-photo.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(500);

    expect(response.body.error.code).toBe('INTERNAL_ERROR');

    expect(response.body.error.message).toBe(
      'Unable to upload emergency photo'
    );

    // No database connection was acquired.
    expect(client.release).not.toHaveBeenCalled();
  });

  test('rejects upload when token is missing', async () => {
    const response = await request(app)
      .post('/api/bookings/photos/security')
      .attach('photo', jpegBuffer, {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_UPLOAD_TOKEN');
  });

  test('rejects upload when token format is invalid', async () => {
    const response = await request(app)
      .post('/api/bookings/photos/security')
      .set('X-Upload-Token', 'invalid-token')
      .attach('photo', jpegBuffer, {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_UPLOAD_TOKEN');
  });

  test('rejects an invalid photo purpose', async () => {
    const response = await request(app)
      .post('/api/bookings/photos/unknown')
      .set('X-Upload-Token', 'a'.repeat(64))
      .attach('photo', jpegBuffer, {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('rejects upload when photo is missing', async () => {
    const response = await request(app)
      .post('/api/bookings/photos/security')
      .set('X-Upload-Token', 'a'.repeat(64));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });


  test('uploads a valid security photo and updates the booking', async () => {
    const token = 'a'.repeat(64);
    const bookingId = 'BK-PHOTO-01';

    client.query.mockImplementation(async (sql) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (['begin', 'commit', 'rollback'].includes(normalized)) {
        return { rows: [], rowCount: 0 };
      }

      if (normalized.includes('from booking_upload_tokens')) {
        return {
          rows: [{ id: 1, booking_id: bookingId }],
          rowCount: 1,
        };
      }

      if (
        normalized.includes('from bookings') &&
        normalized.includes('security_photo_path')
      ) {
        return {
          rows: [{
            id: bookingId,
            security_photo_path: null,
          }],
          rowCount: 1,
        };
      }

      if (normalized.includes('update bookings')) {
        return { rows: [], rowCount: 1 };
      }

      if (normalized.includes('update booking_upload_tokens')) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected client query: ${sql}`);
    });

    let savedFilePath;

    try {
      const response = await request(app)
        .post('/api/bookings/photos/security')
        .set('X-Upload-Token', token)
        .attach('photo', jpegBuffer, {
          filename: 'security-photo.jpg',
          contentType: 'image/jpeg',
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({
        bookingId,
        purpose: 'security',
        uploaded: true,
      });

      const bookingUpdate = client.query.mock.calls.find(
        ([sql]) => sql.includes('UPDATE bookings')
      );

      expect(bookingUpdate).toBeDefined();

      const relativePhotoPath = bookingUpdate[1][0];
      expect(relativePhotoPath).toContain('emergency-photos');

      savedFilePath = path.join(process.cwd(), relativePhotoPath);

      const savedPhoto = await fs.readFile(savedFilePath);

      expect(savedPhoto.equals(jpegBuffer)).toBe(true);

      expect(
        client.query.mock.calls.some(
          ([sql]) => sql.includes('UPDATE booking_upload_tokens')
        )
      ).toBe(true);
    } finally {
      if (savedFilePath) {
        await fs.unlink(savedFilePath).catch(() => {});
      }
    }
  });


  test('rejects an expired or already-used upload token', async () => {
    client.query.mockImplementation(async (sql) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (normalized === 'begin' || normalized === 'rollback') {
        return { rows: [], rowCount: 0 };
      }

      if (normalized.includes('from booking_upload_tokens')) {
        return { rows: [], rowCount: 0 };
      }

      throw new Error(`Unexpected client query: ${sql}`);
    });

    const response = await request(app)
      .post('/api/bookings/photos/security')
      .set('X-Upload-Token', 'b'.repeat(64))
      .attach('photo', jpegBuffer, {
        filename: 'security-photo.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_OR_EXPIRED_TOKEN');
  });

  test('rejects a second security photo for the same booking', async () => {
    client.query.mockImplementation(async (sql) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (normalized === 'begin' || normalized === 'rollback') {
        return { rows: [], rowCount: 0 };
      }

      if (normalized.includes('from booking_upload_tokens')) {
        return {
          rows: [{ id: 2, booking_id: 'BK-PHOTO-02' }],
          rowCount: 1,
        };
      }

      if (
        normalized.includes('from bookings') &&
        normalized.includes('security_photo_path')
      ) {
        return {
          rows: [{
            id: 'BK-PHOTO-02',
            security_photo_path: 'uploads/emergency-photos/existing.jpg',
          }],
          rowCount: 1,
        };
      }

      throw new Error(`Unexpected client query: ${sql}`);
    });

    const response = await request(app)
      .post('/api/bookings/photos/security')
      .set('X-Upload-Token', 'c'.repeat(64))
      .attach('photo', jpegBuffer, {
        filename: 'second-photo.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PHOTO_ALREADY_UPLOADED');
  });


  test('rejects an unsupported file type with JSON error', async () => {
    const response = await request(app)
      .post('/api/bookings/photos/security')
      .set('X-Upload-Token', 'd'.repeat(64))
      .attach('photo', Buffer.from('fake document'), {
        filename: 'document.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('UNSUPPORTED_IMAGE_TYPE');
  });

  test('rejects a photo larger than 5 MB', async () => {
    const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1, 0);

    const response = await request(app)
      .post('/api/bookings/photos/security')
      .set('X-Upload-Token', 'e'.repeat(64))
      .attach('photo', largeBuffer, {
        filename: 'large-photo.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('FILE_TOO_LARGE');
  });

});
