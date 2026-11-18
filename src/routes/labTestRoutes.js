
const express = require('express');

const router = express.Router();

const {
  listLabTests,
  getLabTest,
} = require('../controllers/labTestController');

/**
 * @swagger
 * tags:
 *   name: Lab Tests
 *   description: Laboratory test catalogue
 */

/**
 * @swagger
 * /api/lab-tests:
 *   get:
 *     summary: List available laboratory tests
 *     tags: [Lab Tests]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by test name or code
 *       - in: query
 *         name: sampleType
 *         schema:
 *           type: string
 *         description: Filter by sample type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Laboratory test list
 */
router.get('/', listLabTests);

/**
 * @swagger
 * /api/lab-tests/{id}:
 *   get:
 *     summary: Get a laboratory test by ID
 *     tags: [Lab Tests]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Laboratory test details
 *       404:
 *         description: Lab test not found
 */
router.get('/:id', getLabTest);

module.exports = router;
