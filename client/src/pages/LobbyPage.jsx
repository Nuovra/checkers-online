import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

const TIME_CONTROLS = [
  { id: 'bullet1', label: '1 min',  category: 'Bullet', icon: '⚡' },
  { id: 'blitz3',  label: '3 min',  category: 'Blitz',  icon: '🔥' },
  { id: 'blitz5',  label: '5 min',  category: 'Blitz',  icon: '🔥' },
];

const BOT_DIFFICULTIES = [
  { id: 'easy',   label: 'Easy',   icon: '🟢', desc: 'Perfect for beginners' },
  { id: 'medium', label: 'Medium', icon: '🟡', desc: 'A solid challenge' },
  { id: 'hard',   label: 'Hard',   icon: '🔴', desc: 'Plays to win' },
];

export default function LobbyPage() {
  const { user } = useAuth();
  const { socket, connected, onlineCount } = useSocket();
  const navigate = useNavigate();
  const [mode, setMode] = useState(null); // null | 'online' | 'bot'
  const [inQueue, setInQueue] = useState(false);
  const [queueTime, setQueueTime] = useState(0);
  const [selectedTC, setSelectedTC] = useState('blitz5');

  useEffect(() => {
    if (!socket) return;
    function onGameStarted(gameData) { setInQueue(false); navigate('/game', { state: { gameData } }); }
    function onQueueJoined() { setInQueue(true); }
    function onQueueLeft() { setInQueue(false); }
    socket.on('game_started', onGameStarted);
    socket.on('queue_joined', onQueueJoined);
    socket.on('queue_left', onQueueLeft);
    return () => {
      socket.off('game_started', onGameStarted);
      socket.off('queue_joined', onQueueJoined);
      socket.off('queue_left', onQueueLeft);
    };
  }, [socket, navigate]);

  useEffect(() => {
    if (!inQueue) { setQueueTime(0); return; }
    const i = setInterval(() => setQueueTime(t => t + 1), 1000);
    return () => clearInterval(i);
  }, [inQueue]);

  function joinQueue() { if (socket && connected) socket.emit('join_queue', { timeControlId: selectedTC }); }
  function leaveQueue() { if (socket && connected) socket.emit('leave_queue'); setInQueue(false); }
  function startBotGame(difficulty) { navigate('/game/bot', { state: { difficulty } }); }

  const avatar = localStorage.getItem(`avatar_${user.id}`);

  return (
    <div className="page">
      <div className="lobby">

        {/* Hero */}
        <div className="lobby-hero">
          <div className="lobby-hero-avatar">
            {avatar ? <img src={avatar} alt={user.username} /> : user.username[0].toUpperCase()}
          </div>
          <h1>Welcome, <span>{user.username}</span></h1>
          <p>What would you like to play?</p>
        </div>

        {/* Mode selection */}
        {!mode && !inQueue && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: 560 }}>
            {/* Play Online */}
            <div
              onClick={() => setMode('online')}
              style={{
                flex: 1, minWidth: 220, background: 'var(--bg-card)', border: '2px solid var(--border)',
                borderRadius: 'var(--radius-xl)', padding: '32px 24px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
                transition: 'all 0.2s', textAlign: 'center',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(129,182,76,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{ fontSize: 52 }}>🌐</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.5px' }}>Play Online</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>Challenge real players and earn ELO</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, background: 'var(--green)', borderRadius: '50%', boxShadow: '0 0 6px var(--green)', display: 'inline-block' }} />
                {onlineCount} online now
              </div>
            </div>

            {/* Play Bots */}
            <div
              onClick={() => setMode('bot')}
              style={{
                flex: 1, minWidth: 220, background: 'var(--bg-card)', border: '2px solid var(--border)',
                borderRadius: 'var(--radius-xl)', padding: '32px 24px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
                transition: 'all 0.2s', textAlign: 'center',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(139,92,246,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{ fontSize: 52 }}>🤖</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.5px' }}>Play vs Bot</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>Practice against AI, no time limit</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Easy · Medium · Hard</div>
            </div>
          </div>
        )}

        {/* Online — time control + queue */}
        {mode === 'online' && !inQueue && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: '100%', maxWidth: 560 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setMode(null)}>← Back</button>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>🌐 Play Online</h2>
            </div>

            <div className="tc-section" style={{ width: '100%' }}>
              <div className="tc-section-title">Choose Time Control</div>
              <div className="tc-grid">
                {TIME_CONTROLS.map(tc => (
                  <button key={tc.id} className={`tc-btn${selectedTC === tc.id ? ' tc-active' : ''}`} onClick={() => setSelectedTC(tc.id)}>
                    <span className="tc-icon">{tc.icon}</span>
                    <span className="tc-time">{tc.label}</span>
                    <span className="tc-cat">{tc.category}</span>
                  </button>
                ))}
              </div>
            </div>

            <button className="find-game-btn" onClick={joinQueue}>♟ Find a Game</button>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{onlineCount} player{onlineCount !== 1 ? 's' : ''} online</p>
          </div>
        )}

        {/* In queue */}
        {inQueue && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: '100%', maxWidth: 560 }}>
            <div className="queue-card">
              <div className="queue-spinner" />
              <div className="queue-title">Searching for opponent...</div>
              <div className="queue-tc-info">
                {TIME_CONTROLS.find(t => t.id === selectedTC)?.icon} {TIME_CONTROLS.find(t => t.id === selectedTC)?.label} · {TIME_CONTROLS.find(t => t.id === selectedTC)?.category}
              </div>
              <div className="queue-timer">{Math.floor(queueTime / 60)}:{String(queueTime % 60).padStart(2, '0')}</div>
              <button className="btn btn-ghost" onClick={leaveQueue}>Cancel</button>
            </div>
          </div>
        )}

        {/* Bot difficulty */}
        {mode === 'bot' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: '100%', maxWidth: 560 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setMode(null)}>← Back</button>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>🤖 Play vs Bot</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
              {BOT_DIFFICULTIES.map(d => (
                <div
                  key={d.id}
                  onClick={() => startBotGame(d.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 20, padding: '20px 24px',
                    background: 'var(--bg-card)', border: '2px solid var(--border)',
                    borderRadius: 'var(--radius-lg)', cursor: 'pointer', transition: 'all 0.18s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateX(4px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; }}
                >
                  <span style={{ fontSize: 32 }}>{d.icon}</span>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{d.label}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{d.desc}</div>
                  </div>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 18 }}>→</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
              No time limit · No ELO change · Practice freely
            </p>
          </div>
        )}
      </div>
    </div>
  );
}