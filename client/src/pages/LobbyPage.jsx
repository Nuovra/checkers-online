import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

const TIME_CONTROLS = [
  { id: 'bullet1', label: '1 min', category: 'Bullet', icon: '⚡' },
  { id: 'blitz3',  label: '3 min', category: 'Blitz',  icon: '🔥' },
  { id: 'blitz5',  label: '5 min', category: 'Blitz',  icon: '🔥' },
];
const BOT_DIFFICULTIES = [
  { id: 'easy',   label: 'Easy',   icon: '🟢', desc: 'Perfect for beginners' },
  { id: 'medium', label: 'Medium', icon: '🟡', desc: 'A solid challenge'     },
  { id: 'hard',   label: 'Hard',   icon: '🔴', desc: 'Plays to win'          },
];

export default function LobbyPage() {
  const { user, isGuest } = useAuth();
  const { socket, connected, onlineCount } = useSocket();
  const navigate = useNavigate();
  const [mode, setMode] = useState(null);
  const [inQueue, setInQueue] = useState(false);
  const [queueTime, setQueueTime] = useState(0);
  const [selectedTC, setSelectedTC] = useState('blitz5');

  useEffect(() => {
    if (!socket || isGuest) return;
    const onJoined = () => setInQueue(true);
    const onLeft   = () => setInQueue(false);
    socket.on('queue_joined', onJoined);
    socket.on('queue_left', onLeft);
    return () => { socket.off('queue_joined', onJoined); socket.off('queue_left', onLeft); };
  }, [socket, isGuest]);

  useEffect(() => {
    if (!inQueue) { setQueueTime(0); return; }
    const i = setInterval(() => setQueueTime(t => t + 1), 1000);
    return () => clearInterval(i);
  }, [inQueue]);

  function joinQueue() { if (socket && connected) socket.emit('join_queue', { timeControlId: selectedTC }); }
  function leaveQueue() { if (socket && connected) socket.emit('leave_queue'); setInQueue(false); }
  function goSignup() { navigate('/login?signup=1'); }

  const avatar = localStorage.getItem(`avatar_${user?.id}`);
  const displayOnline = onlineCount;

  const card = (hover) => ({
    flex: 1, minWidth: 220, background: 'var(--bg-card)', border: '2px solid var(--border)',
    borderRadius: 'var(--radius-xl)', padding: '32px 24px', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
    transition: 'transform 0.22s cubic-bezier(.4,0,.2,1), box-shadow 0.22s, border-color 0.22s',
    textAlign: 'center', position: 'relative',
  });

  return (
    <div className="page">
      <div className="lobby">
        <div className="lobby-hero">
          <div className="lobby-hero-avatar">{avatar ? <img src={avatar} alt="" /> : (user?.username?.[0] || 'G').toUpperCase()}</div>
          <h1>Welcome, <span>{user?.username || 'Guest'}</span></h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{isGuest ? 'Playing as guest — create an account to save your progress' : 'What would you like to play?'}</p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(129,182,76,0.08)', border: '1px solid rgba(129,182,76,0.2)', borderRadius: 99, padding: '5px 14px', fontSize: 13, marginTop: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)', display: 'inline-block' }} />
            <span style={{ color: 'var(--text-secondary)' }}><strong style={{ color: 'var(--green)' }}>{displayOnline.toLocaleString()}</strong> players online now</span>
          </div>
        </div>

        {!mode && !inQueue && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: 560 }}>
            <div onClick={() => isGuest ? goSignup() : setMode('online')} style={{ ...card(), borderColor: isGuest ? 'rgba(129,182,76,0.3)' : 'var(--border)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 16px 48px rgba(129,182,76,0.18)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = isGuest ? 'rgba(129,182,76,0.3)' : 'var(--border)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
              {isGuest && <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(129,182,76,0.15)', border: '1px solid rgba(129,182,76,0.4)', color: 'var(--accent)', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: .5 }}>🔒 Sign Up</div>}
              <div style={{ fontSize: 52 }}>🌐</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.5px' }}>Play Online</div>
                <div style={{ fontSize: 13, color: isGuest ? 'var(--accent)' : 'var(--text-secondary)', marginTop: 6, fontWeight: isGuest ? 600 : 400 }}>{isGuest ? 'Create an Account to Play Online' : 'Challenge real players and earn ELO'}</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, background: 'var(--green)', borderRadius: '50%', boxShadow: '0 0 6px var(--green)', display: 'inline-block' }} />{displayOnline.toLocaleString()} online now
              </div>
            </div>
            <div onClick={() => setMode('bot')} style={card()}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 16px 48px rgba(139,92,246,0.18)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
              <div style={{ fontSize: 52 }}>🤖</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.5px' }}>Play vs Bot</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>{isGuest ? 'Practice against AI — free, no account needed' : 'Practice against AI, no time limit'}</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Easy · Medium · Hard</div>
            </div>
          </div>
        )}

        {isGuest && !mode && !inQueue && (
          <div style={{ maxWidth: 560, width: '100%', background: 'rgba(129,182,76,0.06)', border: '1px solid rgba(129,182,76,0.18)', borderRadius: 'var(--radius-lg)', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Want to save your progress?</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Create a free account to earn ELO and play real players</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={goSignup} style={{ whiteSpace: 'nowrap' }}>Sign Up Free →</button>
          </div>
        )}

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
                    <span className="tc-icon">{tc.icon}</span><span className="tc-time">{tc.label}</span><span className="tc-cat">{tc.category}</span>
                  </button>
                ))}
              </div>
            </div>
            <button className="find-game-btn" onClick={joinQueue}>♟ Find a Game</button>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{displayOnline.toLocaleString()} players online</p>
          </div>
        )}

        {inQueue && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: '100%', maxWidth: 560 }}>
            <div className="queue-card">
              <div className="queue-spinner" />
              <div className="queue-title">Searching for opponent...</div>
              <div className="queue-tc-info">{TIME_CONTROLS.find(t => t.id === selectedTC)?.icon} {TIME_CONTROLS.find(t => t.id === selectedTC)?.label} · {TIME_CONTROLS.find(t => t.id === selectedTC)?.category}</div>
              <div className="queue-timer">{Math.floor(queueTime / 60)}:{String(queueTime % 60).padStart(2, '0')}</div>
              <button className="btn btn-ghost" onClick={leaveQueue}>Cancel</button>
            </div>
          </div>
        )}

        {mode === 'bot' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: '100%', maxWidth: 560 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setMode(null)}>← Back</button>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>🤖 Play vs Bot</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
              {BOT_DIFFICULTIES.map(d => (
                <div key={d.id} onClick={() => isGuest ? navigate(`/play?difficulty=${d.id}`) : navigate('/game/bot', { state: { difficulty: d.id } })}
                  style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '20px 24px', background: 'var(--bg-card)', border: '2px solid var(--border)', borderRadius: 'var(--radius-lg)', cursor: 'pointer', transition: 'transform 0.2s cubic-bezier(.4,0,.2,1), border-color 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateX(6px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; }}>
                  <span style={{ fontSize: 32 }}>{d.icon}</span>
                  <div><div style={{ fontSize: 18, fontWeight: 800 }}>{d.label}</div><div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{d.desc}</div></div>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 18 }}>→</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>{isGuest ? 'No account needed · Sign up to save stats and play real players' : 'No time limit · No ELO change · Practice freely'}</p>
          </div>
        )}
      </div>
    </div>
  );
}