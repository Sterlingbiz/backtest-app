const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, 'backtest.env') });
const { Client } = require('pg');

const sslConfig = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase.com')
  ? { rejectUnauthorized: false }
  : undefined;

function createClient() {
  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: sslConfig,
  });
}

async function connectToDatabase() {
  const client = createClient();
  await client.connect();
  return client;
}

async function initializeDatabase(client) {
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
  console.log('Database schema ready');
}

module.exports = {
  createClient,
  connectToDatabase,
  initializeDatabase,
};
