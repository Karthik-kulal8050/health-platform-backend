
jest.mock('../src/config/db', () => ({
  connect: jest.fn(),
  query: jest.fn(),
}));

const pool = require('../src/config/db');

const {
  createLabInvoice,
  listLabInvoices,
  getLabInvoiceById,
} = require('../src/controllers/labInvoiceController');

describe('Lab invoice controller', () => {
  let client;
  let req;
  let res;

  const booking = {
    id: 'LB-TEST-001',
    patient_id: 'U-001',
    status: 'completed',
  };

  const bookingTests = [
    {
      booking_test_id: 1,
      price_at_booking: '350.00',
      test_name: 'Complete Blood Count',
      sample_type: 'Blood',
    },
    {
      booking_test_id: 2,
      price_at_booking: '600.00',
      test_name: 'Lipid Profile',
      sample_type: 'Blood',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    client = {
      query: jest.fn(),
      release: jest.fn(),
    };

    pool.connect.mockResolvedValue(client);

    req = {
      params: { bookingId: 'LB-TEST-001', id: 'INV-TEST-001' },
      query: {},
      user: { id: 'U-OPS-001', role: 'ops' },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe('createLabInvoice', () => {
    test('creates an invoice with itemized booking prices', async () => {
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [booking] }) // booking
        .mockResolvedValueOnce({ rows: [] }) // duplicate check
        .mockResolvedValueOnce({ rows: bookingTests }) // tests
        .mockResolvedValueOnce({ rows: [] }) // invoice insert
        .mockResolvedValueOnce({ rows: [] }) // first item
        .mockResolvedValueOnce({ rows: [] }) // second item
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await createLabInvoice(req, res);

      expect(res.status).toHaveBeenCalledWith(201);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bookingId: 'LB-TEST-001',
            patientId: 'U-001',
            subtotal: '950.00',
            taxAmount: '0.00',
            totalAmount: '950.00',
            status: 'issued',
            items: expect.arrayContaining([
              expect.objectContaining({
                testName: 'Complete Blood Count',
                unitPrice: '350.00',
              }),
              expect.objectContaining({
                testName: 'Lipid Profile',
                unitPrice: '600.00',
              }),
            ]),
          }),
        })
      );

      expect(client.query).toHaveBeenCalledWith(
        'COMMIT'
      );

      expect(client.release).toHaveBeenCalled();
    });

    test('returns 404 when booking does not exist', async () => {
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // booking
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await createLabInvoice(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'BOOKING_NOT_FOUND',
          }),
        })
      );
    });

    test('rejects invoice generation for incomplete booking', async () => {
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ ...booking, status: 'processing' }],
        })
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await createLabInvoice(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'BOOKING_NOT_COMPLETED',
          }),
        })
      );
    });

    test('rejects duplicate invoice generation', async () => {
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [booking] })
        .mockResolvedValueOnce({
          rows: [{ id: 'INV-EXISTING' }],
        })
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await createLabInvoice(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INVOICE_ALREADY_EXISTS',
          }),
        })
      );
    });

    test('rejects booking without tests', async () => {
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [booking] })
        .mockResolvedValueOnce({ rows: [] }) // duplicate check
        .mockResolvedValueOnce({ rows: [] }) // tests
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await createLabInvoice(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'NO_BOOKING_TESTS',
          }),
        })
      );
    });
  });

  describe('listLabInvoices', () => {
    test('restricts patient invoice list to their own records', async () => {
      req.user = { id: 'U-001', role: 'patient' };

      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'INV-001', patientId: 'U-001' }],
      });

      await listLabInvoices(req, res);

      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        ['U-001']
      );

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getLabInvoiceById', () => {
    test('returns invoice with item details', async () => {
      req.user = { id: 'U-001', role: 'patient' };

      pool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'INV-TEST-001',
            patientId: 'U-001',
            totalAmount: '950.00',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            testName: 'Complete Blood Count',
            unitPrice: '350.00',
          }],
        });

      await getLabInvoiceById(req, res);

      expect(pool.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('AND patient_id = $2'),
        ['INV-TEST-001', 'U-001']
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: 'INV-TEST-001',
            items: expect.arrayContaining([
              expect.objectContaining({
                testName: 'Complete Blood Count',
              }),
            ]),
          }),
        })
      );
    });

    test('does not expose another patient invoice', async () => {
      req.user = { id: 'U-TEST-002', role: 'patient' };

      pool.query.mockResolvedValueOnce({ rows: [] });

      await getLabInvoiceById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INVOICE_NOT_FOUND',
          }),
        })
      );

      expect(pool.query).toHaveBeenCalledTimes(1);
    });
  });
});
