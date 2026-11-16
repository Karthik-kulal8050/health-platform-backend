exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE booking_upload_tokens (
      id BIGSERIAL PRIMARY KEY,
      booking_id VARCHAR(20) NOT NULL
        REFERENCES bookings(id) ON DELETE CASCADE,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      purpose VARCHAR(20) NOT NULL
        CHECK (purpose IN ('security', 'incident')),
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_booking_upload_tokens_booking_id
      ON booking_upload_tokens(booking_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS booking_upload_tokens;
  `);
};