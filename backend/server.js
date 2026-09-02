const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectToDatabase, initializeDatabase } = require('./db');
const createCandlesRouter = require('./routes/candles');
const createSymbolsRouter = require('./routes/symbols');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    return res.sendStatus(200);
  }
  next();
});
app.use(express.static(path.join(__dirname)));

async function startServer() {
  try {
    const client = await connectToDatabase();
    await initializeDatabase(client);
    app.use('/candles', createCandlesRouter(client));
    app.use('/symbols', createSymbolsRouter(client));

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
    });

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running at http://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();