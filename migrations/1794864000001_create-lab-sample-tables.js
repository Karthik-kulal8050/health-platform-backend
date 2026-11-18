
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE lab_samples (
      id VARCHAR(30) PRIMARY KEY,
      lab_booking_id VARCHAR(20) NOT NULL
        REFERENCES lab_bookings(id) ON DELETE CASCADE,
      barcode VARCHAR(100) NOT NULL UNIQUE,
      sample_type VARCHAR(50) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'collected'
        CHECK (
          status IN (
            'collected',
            'received',
            'processing',
            'processed',
            'rejected'
          )
        ),
      collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      collected_by VARCHAR(20) REFERENCES users(id),
      received_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE lab_sample_tests (
      id BIGSERIAL PRIMARY KEY,
      sample_id VARCHAR(30) NOT NULL
        REFERENCES lab_samples(id) ON DELETE CASCADE,
      lab_booking_test_id BIGINT NOT NULL
        REFERENCES lab_booking_tests(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (sample_id, lab_booking_test_id)
    );

    CREATE INDEX idx_lab_samples_booking
      ON lab_samples(lab_booking_id);

    CREATE INDEX idx_lab_samples_status
      ON lab_samples(status);

    CREATE INDEX idx_lab_sample_tests_sample
      ON lab_sample_tests(sample_id);

    CREATE INDEX idx_lab_sample_tests_booking_test
      ON lab_sample_tests(lab_booking_test_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS lab_sample_tests;
    DROP TABLE IF EXISTS lab_samples;
  `);
};
