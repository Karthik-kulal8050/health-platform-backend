
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE lab_tests (
      id VARCHAR(20) PRIMARY KEY,
      test_code VARCHAR(30) NOT NULL UNIQUE,
      name VARCHAR(200) NOT NULL,
      description TEXT,
      sample_type VARCHAR(50) NOT NULL,
      price NUMERIC(10, 2) NOT NULL
        CHECK (price >= 0),
      turnaround_hours INTEGER NOT NULL DEFAULT 24
        CHECK (turnaround_hours > 0),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE lab_bookings (
      id VARCHAR(20) PRIMARY KEY,
      patient_id VARCHAR(20) NOT NULL
        REFERENCES users(id),
      hospital_id VARCHAR(20) NOT NULL
        REFERENCES hospitals(id),
      scheduled_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'requested'
        CHECK (status IN (
          'requested', 'confirmed', 'sample_collected',
          'processing', 'completed', 'cancelled'
        )),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE lab_booking_tests (
      id BIGSERIAL PRIMARY KEY,
      lab_booking_id VARCHAR(20) NOT NULL
        REFERENCES lab_bookings(id) ON DELETE CASCADE,
      lab_test_id VARCHAR(20) NOT NULL
        REFERENCES lab_tests(id),
      price_at_booking NUMERIC(10, 2) NOT NULL
        CHECK (price_at_booking >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (lab_booking_id, lab_test_id)
    );

    CREATE INDEX idx_lab_tests_active
      ON lab_tests(is_active);

    CREATE INDEX idx_lab_bookings_patient
      ON lab_bookings(patient_id);

    CREATE INDEX idx_lab_bookings_hospital
      ON lab_bookings(hospital_id);

    CREATE INDEX idx_lab_bookings_status
      ON lab_bookings(status);

    CREATE INDEX idx_lab_bookings_scheduled
      ON lab_bookings(scheduled_at);

    CREATE INDEX idx_lab_booking_tests_booking
      ON lab_booking_tests(lab_booking_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS lab_booking_tests;
    DROP TABLE IF EXISTS lab_bookings;
    DROP TABLE IF EXISTS lab_tests;
  `);
};
