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

  const app    = express();
  const server = http.createServer(app);
  const PORT   = process.env.PORT || 3001;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use('/api/auth', authRouter);

  const io = new Server(server, {
    cors: { origin: true, methods: ['GET', 'POST'], credentials: true }
  });
  setupSocket(io);

  if (isProd) {
    const clientBuild = path.join(__dirname, '../client/dist');
    app.use(express.static(clientBuild));
    app.get('*', (req, res) => {
      res.sendFile(path.join(clientBuild, 'index.html'));
    });
  }

  server.listen(PORT, () => {
    console.log(`\n  ♟  Checkers Online\n  Running on http://localhost:${PORT}\n`);
  });
}

main().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});