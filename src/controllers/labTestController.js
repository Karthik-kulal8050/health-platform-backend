
const { query } = require('../utils/query');

async function listLabTests(req, res) {
  try {
    const limit = Number(req.query.limit ?? 20);
    const offset = Number(req.query.offset ?? 0);
    const search = req.query.search?.trim();
    const sampleType = req.query.sampleType?.trim();

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isInteger(offset) ||
      offset < 0
    ) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Limit must be 1-100 and offset must be 0 or greater.',
        },
      });
    }

    if (req.query.search !== undefined && (!search || search.length > 100)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Search must contain 1-100 characters.',
        },
      });
    }

    if (
      req.query.sampleType !== undefined &&
      (!sampleType || sampleType.length > 50)
    ) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Sample type must contain 1-50 characters.',
        },
      });
    }

    const conditions = ['is_active = TRUE'];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(name ILIKE $${params.length} OR test_code ILIKE $${params.length})`
      );
    }

    if (sampleType) {
      params.push(sampleType);
      conditions.push(`sample_type ILIKE $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*)::INTEGER AS count
       FROM lab_tests
       WHERE ${whereClause}`,
      params
    );

    const dataParams = [...params, limit, offset];

    const result = await query(
      `SELECT id, test_code, name, description, sample_type,
              price, turnaround_hours, is_active, created_at, updated_at
       FROM lab_tests
       WHERE ${whereClause}
       ORDER BY name ASC
       LIMIT $${params.length + 1}
       OFFSET $${params.length + 2}`,
      dataParams
    );

    return res.status(200).json({
      data: result.rows,
      count: countResult.rows[0].count,
      limit,
      offset,
    });
  } catch (error) {
    console.error('List lab tests error:', error.message);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    });
  }
}

async function getLabTest(req, res) {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT id, test_code, name, description, sample_type,
              price, turnaround_hours, is_active, created_at, updated_at
       FROM lab_tests
       WHERE id = $1 AND is_active = TRUE`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Lab test not found',
        },
      });
    }

    return res.status(200).json({
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Get lab test error:', error.message);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    });
  }
}

module.exports = {
  listLabTests,
  getLabTest,
};
