const express = require('express');

module.exports = function createSymbolsRouter(client) {
  const router = express.Router();

  router.get('/', async (_req, res) => {
    try {
      const result = await client.query(`
        SELECT DISTINCT pair
        FROM candles
        ORDER BY pair ASC
      `);

      const pairs = result.rows.map((row) => row.pair);
      res.json(pairs);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not list available symbols' });
    }
  });

  return router;
};
