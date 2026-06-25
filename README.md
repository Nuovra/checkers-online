# ♟ Checkers Online

A full-stack online checkers game with real-time multiplayer, ELO ratings, user profiles, and matchmaking.

## Features

- **Real-time multiplayer** — play against others via WebSocket
- **Full checkers rules** — forced captures, multi-jumps, king promotion, draw detection
- **ELO rating system** — skill-based matchmaking with persistent ratings
- **User profiles** — game history, win/loss record, rating progression
- **Leaderboard** — see the top-ranked players
- **In-game chat** — talk to your opponent during the match
- **Draw offers & resignation** — sportsmanlike game controls

## Tech Stack

- **Backend:** Node.js, Express, Socket.io, SQLite (better-sqlite3), JWT auth, bcrypt
- **Frontend:** React 18, Vite, React Router, Socket.io-client
- **Database:** SQLite (zero-config, file-based — perfect for local dev, easy to migrate)

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm (comes with Node.js)

### 1. Install & Run the Server

```bash
cd server
npm install
npm run dev
```

Server starts on **http://localhost:3001**

### 2. Install & Run the Client (separate terminal)

```bash
cd client
npm install
npm run dev
```

Client starts on **http://localhost:3000**

### 3. Play!

1. Open **http://localhost:3000** in your browser
2. Create an account (or two accounts in separate browsers/incognito windows)
3. Both players click **"Find a Game"**
4. You'll be matched and the game begins!

> **Tip:** To test locally, open one window in Chrome and another in an incognito window (or Firefox). Register different accounts in each and queue up.

## Game Rules (American Checkers)

- Red moves first
- Regular pieces move diagonally forward only
- Kings (crowned on the back row) move diagonally in any direction
- **Captures are mandatory** — if you can jump, you must
- Multi-jumps: if after a capture the piece can jump again, it must continue
- The longest capture chain must be taken
- A piece that reaches the back row becomes a king (turn ends on promotion)
- **Win** by capturing all opponent pieces or blocking all their moves
- **Draw** after 40 moves per side with no capture or promotion

## Project Structure

```
checkers-app/
├── server/
│   ├── index.js          # Express + Socket.io server
│   ├── database.js       # SQLite schema & connection
│   ├── auth.js           # Register, login, JWT, profiles, leaderboard
│   ├── gameEngine.js     # Checkers rules engine
│   ├── gameManager.js    # Matchmaking, active games, socket events
│   ├── elo.js            # ELO rating calculations
│   └── package.json
├── client/
│   ├── src/
│   │   ├── App.jsx               # Routes
│   │   ├── main.jsx              # Entry point
│   │   ├── index.css             # All styles
│   │   ├── components/
│   │   │   ├── Board.jsx         # Checkers board with move logic
│   │   │   └── Navbar.jsx        # Navigation bar
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx     # Auth (login/register)
│   │   │   ├── LobbyPage.jsx     # Matchmaking queue
│   │   │   ├── GamePage.jsx      # Active game view
│   │   │   ├── ProfilePage.jsx   # User profile + history
│   │   │   └── LeaderboardPage.jsx
│   │   ├── context/
│   │   │   ├── AuthContext.jsx   # Auth state management
│   │   │   └── SocketContext.jsx # WebSocket connection
│   │   └── utils/
│   │       └── helpers.js        # Notation, formatting
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── README.md
```

## Deploying to a Domain (24/7 Hosting)

When you're ready to move off localhost:

### Option A: VPS (DigitalOcean, Linode, Hetzner)

1. Build the client: `cd client && npm run build`
2. Set `NODE_ENV=production` on the server — it will serve the built React app
3. Use **PM2** to keep the server running: `pm2 start server/index.js`
4. Put **Nginx** or **Caddy** in front for HTTPS + domain routing
5. Point your domain's DNS to the VPS IP

### Option B: Railway / Render / Fly.io

These platforms auto-detect Node.js apps. Push the repo, set env vars, and they handle the rest.

### Production Checklist

- [ ] Set a strong `JWT_SECRET` environment variable
- [ ] Switch to PostgreSQL for multi-server scaling (SQLite works great for single-server)
- [ ] Add rate limiting on auth endpoints
- [ ] Set up HTTPS (handled by Nginx/Caddy/platform)
- [ ] Configure proper CORS origins
