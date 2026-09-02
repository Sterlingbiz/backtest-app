const envPath = require('path').resolve(__dirname, 'backend', 'backtest.env');
require('dotenv').config({ path: envPath });
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { Client } = require('pg');

const sslConfig = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase.com')
  ? { rejectUnauthorized: false }
  : undefined;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
});

const PAIR = process.argv[2];
const FILENAME = process.argv[3];
const DATA_DIR = path.resolve(__dirname, 'data');
const BATCH_SIZE = 1000;

if (!PAIR || !FILENAME) {
  console.error('Usage: node ingest.js <PAIR> <CSV_FILENAME>');
  console.error('Example: node ingest.js EURUSD EURUSD_M1_2023.csv');
  process.exit(1);
}

const FILE = path.resolve(DATA_DIR, FILENAME);

if (!fs.existsSync(FILE)) {
  console.error(`CSV file not found: ${FILE}`);
  process.exit(1);
}

async function initializeDatabase() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS candles (
      pair TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL,
      open NUMERIC,
      high NUMERIC,
      low NUMERIC,
      close NUMERIC,
      volume NUMERIC,
      PRIMARY KEY (pair, timestamp)
    );
  `);
}

async function run() {
  await client.connect();
  await initializeDatabase();
  console.log(`Connected to Postgres. Ingesting ${PAIR} from ${FILENAME}...`);

  let batch = [];
  let totalInserted = 0;
  const rows = [];

  fs.createReadStream(FILE)
    .pipe(csv({ separator: ';', headers: ['datetime', 'open', 'high', 'low', 'close', 'volume'] }))
    .on('data', (row) => {
      rows.push(row);
    })
    .on('end', async () => {
      console.log(`Parsed ${rows.length} rows. Inserting...`);

      for (const row of rows) {
        const dt = row.datetime;
        const year = dt.slice(0, 4);
        const month = dt.slice(4, 6);
        const day = dt.slice(6, 8);
        const hour = dt.slice(9, 11);
        const min = dt.slice(11, 13);
        const sec = dt.slice(13, 15);
        const timestamp = `${year}-${month}-${day}T${hour}:${min}:${sec}Z`;

        batch.push([PAIR, timestamp, row.open, row.high, row.low, row.close, row.volume]);

        if (batch.length >= BATCH_SIZE) {
          await insertBatch(batch);
          totalInserted += batch.length;
          console.log(`Inserted ${totalInserted} rows so far...`);
          batch = [];
        }
      }

      if (batch.length > 0) {
        await insertBatch(batch);
        totalInserted += batch.length;
      }

      console.log(`Done. Total inserted for ${PAIR}: ${totalInserted}`);
      await client.end();
    });
}

async function insertBatch(batch) {
  const values = [];
  const placeholders = batch.map((row, i) => {
    const offset = i * 7;
    values.push(...row);
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`;
  }).join(', ');

  const query = `
    INSERT INTO candles (pair, timestamp, open, high, low, close, volume)
    VALUES ${placeholders}
    ON CONFLICT (pair, timestamp) DO NOTHING;
  `;

  await client.query(query, values);
}

run().catch((err) => {
  console.error('Error:', err);
  client.end();
});