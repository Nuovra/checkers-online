import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FlagImg } from './StatsPage';

function LockedOverlay({ onSignup, onBack }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      background: 'rgba(13,13,13,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: 'var(--radius-xl)',
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)', padding: '36px 28px',
        textAlign: 'center', maxWidth: 340, width: '100%',
        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 48, marginBottom: 10 }}>🔒</div>
        <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>Leaderboard Locked</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
          Create a free account to see the full leaderboard, track your ranking, and compete with players worldwide!
        </p>
        <button className="btn btn-primary" style={{ width: '100%', padding: '13px', fontSize: 15, fontWeight: 800, marginBottom: 8 }} onClick={onSignup}>
          🚀 Sign Up Free
        </button>
        <button className="btn btn-ghost" style={{ width: '100%', fontSize: 13 }} onClick={onBack}>
          ← Go Back
        </button>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
          Free forever · No credit card needed
        </p>
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const { token, isGuest } = useAuth();
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/leaderboard', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(r => r.json())
      .then(data => setPlayers(data.players || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="page">
      <div className="page-wrapper">
        <div className="page-top-bar">
          <div className="page-title"><span className="page-title-icon">🏆</span> Leaderboard</div>
          <button className="close-btn" onClick={() => navigate('/')}>✕</button>
        </div>

        {/* Table container — relative so overlay can sit on top */}
        <div style={{ position: 'relative' }}>

          {/* Locked overlay for guests */}
          {isGuest && (
            <LockedOverlay
              onSignup={() => navigate('/login?signup=1')}
              onBack={() => navigate('/')}
            />
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div className="queue-spinner" style={{ margin: '0 auto' }} />
            </div>
          ) : players.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0', fontSize: 14 }}>
              No ranked players yet. Play a game to appear here!
            </div>
          ) : (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-xl)', overflow: 'hidden',
              // Blur the table when locked
              filter: isGuest ? 'blur(3px)' : 'none',
              userSelect: isGuest ? 'none' : 'auto',
              pointerEvents: isGuest ? 'none' : 'auto',
            }}>
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Player</th>
                    <th>Rating</th>
                    <th>W</th>
                    <th>L</th>
                    <th>Streak</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, i) => {
                    const rank   = i + 1;
                    const avatar = localStorage.getItem(`avatar_${p.id}`);
                    const streak = p.current_streak || 0;
                    return (
                      <tr key={p.id}
                        onClick={() => !isGuest && navigate(`/profile/${p.username}`)}
                        style={{ cursor: isGuest ? 'default' : 'pointer' }}
                      >
                        <td>
                          <span className={`rank-badge${rank <= 3 ? ` rank-${rank}` : ''}`}>
                            {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
                          </span>
                        </td>
                        <td>
                          <div className="lb-player">
                            <div className="lb-avatar">
                              {avatar ? <img src={avatar} alt={p.username} /> : p.username[0].toUpperCase()}
                            </div>
                            <span className="lb-username">{p.username}</span>
                            {p.country && <FlagImg code={p.country} size={16} />}
                          </div>
                        </td>
                        <td><span className="elo-col">{p.elo}</span></td>
                        <td style={{ color: 'var(--green)' }}>{p.wins}</td>
                        <td style={{ color: 'var(--red-col)' }}>{p.losses}</td>
                        <td style={{ color: streak >= 3 ? 'var(--gold)' : 'var(--text-muted)', fontWeight: streak >= 3 ? 700 : 400 }}>
                          {streak > 0 ? `${streak} 🔥` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}