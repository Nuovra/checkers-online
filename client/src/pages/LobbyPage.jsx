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
  { id: 'medium', label: 'Medium', icon: '🟡', desc: 'A solid challenge'     },
  { id: 'hard',   label: 'Hard',   icon: '🔴', desc: 'Plays to win'          },
];

// ── Locked overlay for guests ─────────────────────────────────────────────────
function LockedOverlay({ onSignup }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999,
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)', padding: '40px 32px',
        textAlign: 'center', maxWidth: 400, width: '100%',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🔒</div>
        <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>Create a Free Account</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
          Sign up to unlock the full leaderboard, see player rankings, and compete for the top spot!
        </p>
        <button className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: 16, fontWeight: 800, marginBottom: 10 }} onClick={onSignup}>
          🚀 Sign Up Free
        </button>
        <button className="btn btn-ghost" style={{ width: '100%', fontSize: 13 }} onClick={() => window.history.back()}>
          ← Go Back
        </button>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
          Free forever · No credit card · 30 seconds
        </p>
      </div>
    </div>
  );
}

export default function LobbyPage() {
  const { user, isGuest } = useAuth();
  const { socket, connected, onlineCount } = useSocket();
  const navigate = useNavigate();

  const [mode,         setMode]         = useState(null);
  const [inQueue,      setInQueue]      = useState(false);
  const [queueTime,    setQueueTime]    = useState(0);
  const [selectedTC,   setSelectedTC]   = useState('blitz5');
  const [showLocked,   setShowLocked]   = useState(false);

  useEffect(() => {
    if (!socket || isGuest) return;
    function onGameStarted(gameData) { setInQueue(false); navigate('/game', { state: { gameData } }); }
    function onQueueJoined()         { setInQueue(true); }
    function onQueueLeft()           { setInQueue(false); }
    socket.on('game_started', onGameStarted);
    socket.on('queue_joined',  onQueueJoined);
    socket.on('queue_left',    onQueueLeft);
    return () => {
      socket.off('game_started', onGameStarted);
      socket.off('queue_joined',  onQueueJoined);
      socket.off('queue_left',    onQueueLeft);
    };
  }, [socket, navigate, isGuest]);

  useEffect(() => {
    if (!inQueue) { setQueueTime(0); return; }
    const i = setInterval(() => setQueueTime(t => t + 1), 1000);
    return () => clearInterval(i);
  }, [inQueue]);

  function joinQueue()            { if (socket && connected) socket.emit('join_queue', { timeControlId: selectedTC }); }
  function leaveQueue()           { if (socket && connected) socket.emit('leave_queue'); setInQueue(false); }
  function startBotGame(diffId)   { navigate('/game/bot', { state: { difficulty: diffId } }); }
  function startGuestGame(diffId) { navigate(`/play?difficulty=${diffId}`); }
  function goSignup()             { navigate('/login?signup=1'); }

  const avatar = localStorage.getItem(`avatar_${user?.id}`);

  // Fake online count for guests — same as real users see
  const displayOnline = onlineCount;

  return (
    <div className="page">
      {/* Locked overlay for leaderboard redirect */}
      {showLocked && <LockedOverlay onSignup={goSignup} />}

      <div className="lobby">

        {/* Hero */}
        <div className="lobby-hero">
          <div className="lobby-hero-avatar">
            {avatar
              ? <img src={avatar} alt={user?.username} />
              : (user?.username?.[0] || 'G').toUpperCase()
            }
          </div>
          <h1>Welcome, <span>{user?.username || 'Guest'}</span></h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {isGuest
              ? 'Playing as guest — create an account to save your progress'
              : 'What would you like to play?'}
          </p>

          {/* Online pill — always visible */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(129,182,76,0.08)', border: '1px solid rgba(129,182,76,0.2)',
            borderRadius: 99, padding: '5px 14px', fontSize: 13, marginTop: 8,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)', display: 'inline-block' }} />
            <span style={{ color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--green)' }}>{displayOnline.toLocaleString()}</strong> players online now
            </span>
          </div>
        </div>

        {/* Main mode cards */}
        {!mode && !inQueue && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: 560 }}>

            {/* Play Online */}
            <div
              onClick={() => isGuest ? goSignup() : setMode('online')}
              style={{
                flex: 1, minWidth: 220, background: 'var(--bg-card)',
                border: `2px solid ${isGuest ? 'rgba(129,182,76,0.3)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-xl)', padding: '32px 24px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
                transition: 'all 0.2s', textAlign: 'center', position: 'relative',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.transform='translateY(-4px)'; e.currentTarget.style.boxShadow='0 12px 40px rgba(129,182,76,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor=isGuest?'rgba(129,182,76,0.3)':'var(--border)'; e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none'; }}
            >
              {isGuest && (
                <div style={{
                  position: 'absolute', top: 10, right: 10,
                  background: 'rgba(129,182,76,0.15)', border: '1px solid rgba(129,182,76,0.4)',
                  color: 'var(--accent)', fontSize: 10, fontWeight: 800,
                  padding: '2px 8px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: 0.5,
                }}>🔒 Sign Up</div>
              )}
              <div style={{ fontSize: 52 }}>🌐</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.5px' }}>Play Online</div>
                <div style={{ fontSize: 13, color: isGuest ? 'var(--accent)' : 'var(--text-secondary)', marginTop: 6, fontWeight: isGuest ? 600 : 400 }}>
                  {isGuest ? 'Create an Account to Play Online' : 'Challenge real players and earn ELO'}
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, background: 'var(--green)', borderRadius: '50%', boxShadow: '0 0 6px var(--green)', display: 'inline-block' }} />
                {displayOnline.toLocaleString()} online now
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
              onMouseEnter={e => { e.currentTarget.style.borderColor='#8b5cf6'; e.currentTarget.style.transform='translateY(-4px)'; e.currentTarget.style.boxShadow='0 12px 40px rgba(139,92,246,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none'; }}
            >
              <div style={{ fontSize: 52 }}>🤖</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.5px' }}>Play vs Bot</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
                  {isGuest ? 'Practice against AI — free, no account needed' : 'Practice against AI, no time limit'}
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Easy · Medium · Hard</div>
            </div>
          </div>
        )}

        {/* Guest signup nudge */}
        {isGuest && !mode && !inQueue && (
          <div style={{
            maxWidth: 560, width: '100%',
            background: 'rgba(129,182,76,0.06)', border: '1px solid rgba(129,182,76,0.18)',
            borderRadius: 'var(--radius-lg)', padding: '14px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
                Want to save your progress?
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Create a free account to earn ELO and play real players
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={goSignup} style={{ whiteSpace: 'nowrap' }}>
              Sign Up Free →
            </button>
          </div>
        )}

        {/* Online time control — logged in only */}
        {mode === 'online' && !inQueue && !isGuest && (
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
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {displayOnline.toLocaleString()} player{displayOnline !== 1 ? 's' : ''} online
            </p>
          </div>
        )}

        {/* In queue */}
        {inQueue && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: '100%', maxWidth: 560 }}>
            <div className="queue-card">
              <div className="queue-spinner" />
              <div className="queue-title">Searching for opponent...</div>
              <div className="queue-tc-info">
                {TIME_CONTROLS.find(t => t.id === selectedTC)?.icon}{' '}
                {TIME_CONTROLS.find(t => t.id === selectedTC)?.label} ·{' '}
                {TIME_CONTROLS.find(t => t.id === selectedTC)?.category}
              </div>
              <div className="queue-timer">{Math.floor(queueTime / 60)}:{String(queueTime % 60).padStart(2, '0')}</div>
              <button className="btn btn-ghost" onClick={leaveQueue}>Cancel</button>
            </div>
          </div>
        )}

        {/* Bot difficulty picker */}
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
                  onClick={() => isGuest ? startGuestGame(d.id) : startBotGame(d.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 20, padding: '20px 24px',
                    background: 'var(--bg-card)', border: '2px solid var(--border)',
                    borderRadius: 'var(--radius-lg)', cursor: 'pointer', transition: 'all 0.18s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.transform='translateX(4px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='none'; }}
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
              {isGuest
                ? 'No account needed · Sign up to save stats and play real players'
                : 'No time limit · No ELO change · Practice freely'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}