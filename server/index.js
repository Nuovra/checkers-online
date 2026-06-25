const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database');
const { router: authRouter } = require('./auth');
const { setupSocket } = require('./gameManager');

async function main() {
  await initDatabase();

  const app = express();
  const server = http.createServer(app);
  const PORT = process.env.PORT || 3001;

  app.use(cors({
    origin: true,
    credentials: true
  }));
  app.use(express.json());

  app.use('/api/auth', authRouter);

  const io = new Server(server, {
    cors: {
      origin: true,
      methods: ['GET', 'POST'],
      credentials: true
    }
  });
  setupSocket(io);

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../client/build')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../client/build/index.html'));
    });
  }

  server.listen(PORT, () => {
    console.log('');
    console.log('  ♟  Checkers Online Server');
    console.log(`  Running on http://localhost:${PORT}`);
    console.log('');
  });
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});