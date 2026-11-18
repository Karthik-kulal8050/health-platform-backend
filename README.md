# Health Platform Backend

Backend for an Emergency and Home Healthcare Platform, built with Node.js, Express, and PostgreSQL.

## Tech Stack

- Node.js and Express
- PostgreSQL
- JWT authentication and role-based authorization
- Jest and Supertest
- Multer for file uploads
- Swagger / OpenAPI documentation
- AI recommendation and ETA integration

## Features

### Emergency Healthcare
- Emergency and guest booking APIs
- Ambulance and hospital management
- Ambulance location and GPS APIs
- AI-based ambulance recommendation and ETA integration
- Emergency photo upload with file validation

### Laboratory Services
- Lab test catalogue with search and filtering
- Lab booking creation and status management
- Sample collection and barcode generation
- Sample status tracking
- PDF lab report uploads and downloads
- Automatic health record creation and patient-level access control

### Invoices and Payments
- Lab invoice generation with itemized price snapshots
- Invoice retrieval and payment history
- Sandbox payment initiation and outcome simulation
- Payment status and invoice status updates

**Note:** Payments are sandbox-only. No live payment gateway is configured.

## Setup

1. Clone the repository.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure your local environment using `.env.example`.
4. Create the PostgreSQL database and configure the database connection.
5. Apply migrations:

   ```bash
   npm run db:migrate
   ```

6. Run the seed script if the required seed data is configured:

   ```bash
   npm run db:seed
   ```

7. Start the server:

   ```bash
   npm start
   ```

## API Documentation

Swagger documentation is available at:

`http://localhost:4000/api-docs`

## Tests

Run the automated test suite:

```bash
npm test
```

Latest verified result:

- 17 test suites passed
- 121 tests passed
- 0 failures

## BE-10 AI Integration

Mock recommendation, ETA estimation, response validation, timeout handling, and fallback behavior are implemented.

Live AI service integration depends on confirmation of the ML service endpoints.

See `docs/integration.md` for integration details.

## Scope Notes

- Sandbox payment processing is implemented for testing; live payment credentials and gateway integration are not configured.
- A claims workflow is not included because an authorized workflow specification and integration requirements have not been provided.
- Use synthetic data for local development and testing.
