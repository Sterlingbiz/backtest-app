const express = require('express');

const TIMEFRAME_MAP = {
  '1m': '1 minute',
  '5m': '5 minutes',
  '15m': '15 minutes',
  '30m': '30 minutes',
  '1h': '1 hour',
  '4h': '4 hours',
  '1d': '1 day',
};

module.exports = function createCandlesRouter(client) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const { pair, from, to, timeframe = '1m' } = req.query;

    if (!pair || !from || !to) {
      return res.status(400).json({ error: 'pair, from, and to query params are required' });
    }

    const interval = TIMEFRAME_MAP[timeframe];
    if (!interval) {
      return res.status(400).json({ error: `Invalid timeframe. Use one of: ${Object.keys(TIMEFRAME_MAP).join(', ')}` });
    }

    try {
      const fromDate = new Date(from).toISOString();
      const toDate = new Date(to).toISOString();
      let rows;

      if (timeframe === '1m') {
        const result = await client.query(
          `SELECT timestamp, open, high, low, close, volume
           FROM candles
           WHERE pair = $1 AND timestamp >= $2 AND timestamp <= $3
           ORDER BY timestamp ASC`,
          [pair, fromDate, toDate]
        );
        rows = result.rows;
      } else {
        const result = await client.query(
          `WITH bucketed AS (
             SELECT
               date_bin($4::interval, timestamp, TIMESTAMP '2000-01-01') AS bucket,
               timestamp, open, high, low, close, volume
             FROM candles
             WHERE pair = $1 AND timestamp >= $2 AND timestamp <= $3
           )
           SELECT
             bucket AS timestamp,
             (array_agg(open ORDER BY timestamp ASC))[1] AS open,
             MAX(high) AS high,
             MIN(low) AS low,
             (array_agg(close ORDER BY timestamp DESC))[1] AS close,
             SUM(volume) AS volume
           FROM bucketed
           GROUP BY bucket
           ORDER BY bucket ASC`,
          [pair, fromDate, toDate, interval]
        );
        rows = result.rows;
      }

      const candles = rows.map((row) => ({
        time: Math.floor(new Date(row.timestamp).getTime() / 1000),
        open: parseFloat(row.open),
        high: parseFloat(row.high),
        low: parseFloat(row.low),
        close: parseFloat(row.close),
        volume: parseFloat(row.volume) || 0,
      }));

      res.json(candles);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong fetching candles' });
    }
  });

  return router;
};
