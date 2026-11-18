
jest.mock('../src/config/db', () => ({
  connect: jest.fn(),
  query: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
  access: jest.fn().mockResolvedValue(undefined),
}));

const pool = require('../src/config/db');
const fs = require('fs/promises');

const {
  uploadLabReport,
  listLabReports,
  downloadLabReport,
} = require('../src/controllers/labReportController');

describe('Lab report controller', () => {
  let client;
  let req;
  let res;

  const booking = {
    id: 'LB-TEST-001',
    patient_id: 'U-001',
    status: 'processing',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    client = {
      query: jest.fn(),
      release: jest.fn(),
    };

    pool.connect.mockResolvedValue(client);

    req = {
      params: {
        bookingId: 'LB-TEST-001',
        id: 'LR-TEST-001',
      },
      query: {},
      user: {
        id: 'U-OPS-001',
        role: 'ops',
      },
      file: {
        originalname: 'lab-report.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF-test'),
      },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      download: jest.fn(),
      headersSent: false,
    };
  });

  describe('uploadLabReport', () => {
    test('uploads report and creates linked health record', async () => {
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [booking],
          rowCount: 1,
        }) // booking
        .mockResolvedValueOnce({ rows: [] }) // health record
        .mockResolvedValueOnce({
          rows: [{
            id: 'LR-TEST-001',
            bookingId: 'LB-TEST-001',
            healthRecordId: 'HR-TEST-001',
            patientId: 'U-001',
            status: 'available',
          }],
        }) // report
        .mockResolvedValueOnce({ rows: [] }) // complete booking
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await uploadLabReport(req, res);

      expect(res.status).toHaveBeenCalledWith(201);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: 'LR-TEST-001',
            bookingId: 'LB-TEST-001',
            healthRecordId: 'HR-TEST-001',
            patientId: 'U-001',
          }),
        })
      );

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();

      const healthRecordInsert = client.query.mock.calls.find(
        ([sql]) => sql.includes('INSERT INTO health_records')
      );

      expect(healthRecordInsert).toBeDefined();

      expect(healthRecordInsert[1][0]).toMatch(
        /^HR-[A-F0-9]{20}$/
      );

      expect(healthRecordInsert[1][1]).toBe('U-001');
      expect(healthRecordInsert[1][2]).toBe('lab_report');
      expect(healthRecordInsert[1][5]).toBe('U-OPS-001');

      expect(client.query).toHaveBeenCalledWith(
        'COMMIT'
      );

      expect(client.release).toHaveBeenCalled();
    });

    test('rejects missing PDF report', async () => {
      req.file = undefined;

      await uploadLabReport(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
          }),
        })
      );

      expect(pool.connect).not.toHaveBeenCalled();
    });

    test('returns 404 when booking does not exist', async () => {
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        }) // booking
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await uploadLabReport(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'BOOKING_NOT_FOUND',
          }),
        })
      );

      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    test('rejects report upload when booking is not processing', async () => {
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            ...booking,
            status: 'completed',
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await uploadLabReport(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INVALID_BOOKING_STATUS',
          }),
        })
      );

      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('listLabReports', () => {
    test('restricts patient report list to their own records', async () => {
      req.user = {
        id: 'U-001',
        role: 'patient',
      };

      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'LR-001',
          patientId: 'U-001',
        }],
      });

      await listLabReports(req, res);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE lr.patient_id = $1'),
        ['U-001', 20, 0]
      );

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('downloadLabReport', () => {
    test('downloads an available report belonging to patient', async () => {
      req.user = {
        id: 'U-001',
        role: 'patient',
      };

      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'LR-TEST-001',
          patient_id: 'U-001',
          report_path: 'uploads/lab-reports/LR-TEST-001.pdf',
          original_filename: 'lab-report.pdf',
          status: 'available',
        }],
      });

      await downloadLabReport(req, res);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('AND patient_id = $2'),
        ['LR-TEST-001', 'U-001']
      );

      expect(fs.access).toHaveBeenCalled();
      expect(res.download).toHaveBeenCalledWith(
        expect.stringContaining('LR-TEST-001.pdf'),
        'lab-report.pdf',
        expect.any(Function)
      );
    });

    test('does not expose another patient report', async () => {
      req.user = {
        id: 'U-TEST-002',
        role: 'patient',
      };

      pool.query.mockResolvedValueOnce({
        rows: [],
      });

      await downloadLabReport(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'REPORT_NOT_FOUND',
          }),
        })
      );

      expect(fs.access).not.toHaveBeenCalled();
    });

    test('rejects reports with an invalid file path', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'LR-TEST-001',
          patient_id: 'U-001',
          report_path: 'uploads/other-folder/report.pdf',
          original_filename: 'report.pdf',
          status: 'available',
        }],
      });

      await downloadLabReport(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INVALID_REPORT_PATH',
          }),
        })
      );

      expect(fs.access).not.toHaveBeenCalled();
    });
  });
});
