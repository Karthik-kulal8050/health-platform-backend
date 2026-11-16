
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE bookings
      ALTER COLUMN patient_id DROP NOT NULL;

    ALTER TABLE bookings
      ADD COLUMN contact_number VARCHAR(20),
      ADD COLUMN incident_severity VARCHAR(20)
        CHECK (incident_severity IN (
          'critical', 'high', 'moderate', 'low'
        )),
      ADD COLUMN patient_condition TEXT,
      ADD COLUMN incident_photo_path TEXT,
      ADD COLUMN security_photo_path TEXT;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE bookings
      ALTER COLUMN patient_id SET NOT NULL;

    ALTER TABLE bookings
      DROP COLUMN security_photo_path,
      DROP COLUMN incident_photo_path,
      DROP COLUMN patient_condition,
      DROP COLUMN incident_severity,
      DROP COLUMN contact_number;
  `);
};
