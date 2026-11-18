
exports.up = (pgm) => {
  // One invoice per completed lab booking.
  pgm.sql(`
    CREATE TABLE lab_invoices (
      id VARCHAR(30) PRIMARY KEY,
      booking_id VARCHAR(20) NOT NULL,
      patient_id VARCHAR(20) NOT NULL,
      subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
      tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (tax_amount >= 0),
      total_amount NUMERIC(12,2) NOT NULL
        CHECK (total_amount >= 0),
      status VARCHAR(20) NOT NULL DEFAULT 'issued'
        CHECK (status IN ('issued', 'paid', 'void')),
      issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT uq_lab_invoice_booking UNIQUE (booking_id),
      CONSTRAINT uq_lab_invoice_id_patient UNIQUE (id, patient_id),

      CONSTRAINT fk_invoice_booking_patient
        FOREIGN KEY (booking_id, patient_id)
        REFERENCES lab_bookings(id, patient_id)
    );
  `);

  // Snapshot of the tests and prices included in the invoice.
  pgm.sql(`
    CREATE TABLE lab_invoice_items (
      id BIGSERIAL PRIMARY KEY,
      invoice_id VARCHAR(30) NOT NULL
        REFERENCES lab_invoices(id) ON DELETE CASCADE,
      lab_booking_test_id BIGINT NOT NULL
        REFERENCES lab_booking_tests(id),
      test_name VARCHAR(200) NOT NULL,
      sample_type VARCHAR(50) NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
      unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
      line_total NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT uq_invoice_booking_test
        UNIQUE (invoice_id, lab_booking_test_id)
    );
  `);

  // Sandbox-only payment transactions.
  pgm.sql(`
    CREATE TABLE lab_payments (
      id VARCHAR(30) PRIMARY KEY,
      invoice_id VARCHAR(30) NOT NULL,
      patient_id VARCHAR(20) NOT NULL,
      provider VARCHAR(20) NOT NULL DEFAULT 'sandbox'
        CHECK (provider = 'sandbox'),
      provider_reference VARCHAR(100) NOT NULL UNIQUE,
      amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      currency VARCHAR(3) NOT NULL DEFAULT 'INR'
        CHECK (currency = 'INR'),
      payment_method VARCHAR(30) NOT NULL
        CHECK (
          payment_method IN (
            'sandbox_card',
            'sandbox_upi',
            'sandbox_netbanking'
          )
        ),
      status VARCHAR(20) NOT NULL DEFAULT 'initiated'
        CHECK (
          status IN (
            'initiated',
            'succeeded',
            'failed',
            'cancelled'
          )
        ),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,

      CONSTRAINT fk_payment_invoice_patient
        FOREIGN KEY (invoice_id, patient_id)
        REFERENCES lab_invoices(id, patient_id)
    );
  `);

  pgm.sql(`
    CREATE INDEX idx_lab_invoices_patient
      ON lab_invoices(patient_id);

    CREATE INDEX idx_lab_invoice_items_invoice
      ON lab_invoice_items(invoice_id);

    CREATE INDEX idx_lab_payments_invoice
      ON lab_payments(invoice_id);

    CREATE INDEX idx_lab_payments_patient
      ON lab_payments(patient_id);

    CREATE INDEX idx_lab_payments_status
      ON lab_payments(status);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS lab_payments;
    DROP TABLE IF EXISTS lab_invoice_items;
    DROP TABLE IF EXISTS lab_invoices;
  `);
};
