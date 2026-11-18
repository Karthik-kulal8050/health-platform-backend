
exports.up = (pgm) => {
  // Add a composite unique constraint so reports can enforce
  // that the booking and health record belong to the same patient.
  pgm.sql(`
    ALTER TABLE lab_bookings
    ADD CONSTRAINT uq_lab_bookings_id_patient
    UNIQUE (id, patient_id);
  `);

  // Patient health records.
  pgm.sql(`
    CREATE TABLE health_records (
      id VARCHAR(30) PRIMARY KEY,

      patient_id VARCHAR(20) NOT NULL
        REFERENCES users(id),

      record_type VARCHAR(50) NOT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT,

      created_by VARCHAR(20)
        REFERENCES users(id),

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT uq_health_records_id_patient
        UNIQUE (id, patient_id)
    );
  `);

  // Laboratory reports linked to bookings and health records.
  pgm.sql(`
    CREATE TABLE lab_reports (
      id VARCHAR(30) PRIMARY KEY,

      lab_booking_id VARCHAR(20) NOT NULL,
      health_record_id VARCHAR(30) NOT NULL,
      patient_id VARCHAR(20) NOT NULL,

      report_path TEXT NOT NULL,
      original_filename VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
      file_size INTEGER NOT NULL
        CHECK (file_size > 0 AND file_size <= 5242880),

      status VARCHAR(20) NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'retracted')),

      uploaded_by VARCHAR(20) NOT NULL
        REFERENCES users(id),

      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT fk_report_booking_patient
        FOREIGN KEY (lab_booking_id, patient_id)
        REFERENCES lab_bookings(id, patient_id),

      CONSTRAINT fk_report_health_record_patient
        FOREIGN KEY (health_record_id, patient_id)
        REFERENCES health_records(id, patient_id)
    );
  `);

  // Indexes for common patient and booking queries.
  pgm.sql(`
    CREATE INDEX idx_health_records_patient
      ON health_records(patient_id);

    CREATE INDEX idx_lab_reports_booking
      ON lab_reports(lab_booking_id);

    CREATE INDEX idx_lab_reports_health_record
      ON lab_reports(health_record_id);

    CREATE INDEX idx_lab_reports_patient
      ON lab_reports(patient_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS lab_reports;
    DROP TABLE IF EXISTS health_records;

    ALTER TABLE lab_bookings
    DROP CONSTRAINT IF EXISTS uq_lab_bookings_id_patient;
  `);
};
