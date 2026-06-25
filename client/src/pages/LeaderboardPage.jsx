import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FlagImg } from './StatsPage';

export default function LeaderboardPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/leaderboard', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setPlayers(data.players || []))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return (
    <div className="page" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="queue-spinner" />
    </div>
  );

  return (
    <div className="page">
      <div className="page-wrapper">
        <div className="page-top-bar">
          <div className="page-title"><span className="page-title-icon">🏆</span> Leaderboard</div>
          <button className="close-btn" onClick={() => navigate('/')}>✕</button>
        </div>

        {players.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0', fontSize: 14 }}>
            No ranked players yet. Play a game to appear here!
          </div>
        ) : (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
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
                    <tr key={p.id} onClick={() => navigate(`/profile/${p.username}`)} style={{ cursor: 'pointer' }}>
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
  );
}