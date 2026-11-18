
require('dotenv').config();

const pool = require('../src/config/db');

const labTests = [
  {
    id: 'LT-001',
    code: 'CBC',
    name: 'Complete Blood Count',
    description: 'Measures different components of blood.',
    sample: 'Blood',
    price: 350,
    hours: 24,
  },
  {
    id: 'LT-002',
    code: 'LIPID',
    name: 'Lipid Profile',
    description: 'Measures cholesterol and triglyceride levels.',
    sample: 'Blood',
    price: 600,
    hours: 24,
  },
  {
    id: 'LT-003',
    code: 'GLUCOSE',
    name: 'Blood Glucose Test',
    description: 'Measures blood glucose levels.',
    sample: 'Blood',
    price: 150,
    hours: 6,
  },
  {
    id: 'LT-004',
    code: 'TSH',
    name: 'Thyroid Stimulating Hormone',
    description: 'Measures thyroid stimulating hormone levels.',
    sample: 'Blood',
    price: 450,
    hours: 24,
  },
  {
    id: 'LT-005',
    code: 'URINE',
    name: 'Urine Routine Test',
    description: 'Examines physical and chemical properties of urine.',
    sample: 'Urine',
    price: 200,
    hours: 12,
  },
];

async function seedLabTests() {
  try {
    for (const test of labTests) {
      await pool.query(
        `INSERT INTO lab_tests
          (id, test_code, name, description, sample_type, price, turnaround_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           test_code = EXCLUDED.test_code,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           sample_type = EXCLUDED.sample_type,
           price = EXCLUDED.price,
           turnaround_hours = EXCLUDED.turnaround_hours,
           updated_at = NOW()`,
        [
          test.id,
          test.code,
          test.name,
          test.description,
          test.sample,
          test.price,
          test.hours,
        ]
      );
    }

    console.log('Lab test catalogue seeded successfully.');
  } catch (error) {
    console.error('Lab test seeding failed:', error.message);
    throw error;
  }
}

module.exports = seedLabTests;
