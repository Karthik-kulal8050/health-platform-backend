
jest.mock('../src/config/db', () => ({
  connect: jest.fn(),
  query: jest.fn(),
}));

const pool = require('../src/config/db');
const {
  processSandboxPaymentResult,
} = require('../src/controllers/labPaymentController');

describe('Sandbox payment result', () => {
  let client;
  let req;
  let res;

  const payment = {
    id: 'PAY-TEST-001',
    invoice_id: 'INV-TEST-001',
    patient_id: 'U-001',
    amount: '950.00',
    status: 'initiated',
    invoice_status: 'issued',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    client = {
      query: jest.fn(),
      release: jest.fn(),
    };

    pool.connect.mockResolvedValue(client);

    req = {
      params: { id: 'PAY-TEST-001' },
      body: {},
      user: { id: 'U-OPS-001', role: 'ops' },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  test.each(['succeeded', 'failed', 'cancelled'])(
    'processes payment outcome: %s',
    async (outcome) => {
      req.body.outcome = outcome;

      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [payment] }) // SELECT
        .mockResolvedValueOnce({
          rows: [{ id: payment.id, status: outcome }],
        }); // UPDATE payment

      if (outcome === 'succeeded') {
        client.query.mockResolvedValueOnce({ rows: [] }); // UPDATE invoice
      }

      client.query.mockResolvedValueOnce({ rows: [] }); // COMMIT

      await processSandboxPaymentResult(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: outcome }),
        })
      );

      expect(client.query).toHaveBeenCalledWith(
        'COMMIT'
      );

      if (outcome === 'succeeded') {
        expect(client.query).toHaveBeenCalledWith(
          expect.stringContaining("status = 'paid'"),
          ['INV-TEST-001']
        );
      } else {
        expect(client.query).not.toHaveBeenCalledWith(
          expect.stringContaining("status = 'paid'"),
          expect.anything()
        );
      }

      expect(client.release).toHaveBeenCalled();
    }
  );

  test('rejects an invalid payment outcome', async () => {
    req.body.outcome = 'pending';

    await processSandboxPaymentResult(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'INVALID_PAYMENT_OUTCOME',
        message: 'Outcome must be succeeded, failed, or cancelled.',
      },
    });

    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('returns 404 when payment does not exist', async () => {
    req.body.outcome = 'succeeded';

    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    await processSandboxPaymentResult(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'PAYMENT_NOT_FOUND',
        }),
      })
    );
  });

  test('rejects a payment that has already been processed', async () => {
    req.body.outcome = 'succeeded';

    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ ...payment, status: 'failed' }],
      }) // SELECT
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    await processSandboxPaymentResult(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'PAYMENT_ALREADY_PROCESSED',
        }),
      })
    );
  });

  test('does not succeed when invoice is no longer payable', async () => {
    req.body.outcome = 'succeeded';

    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ ...payment, invoice_status: 'paid' }],
      }) // SELECT
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    await processSandboxPaymentResult(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'INVOICE_NOT_PAYABLE',
        }),
      })
    );
  });
});
