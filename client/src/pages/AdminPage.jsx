import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function formatDate(str) {
  if (!str) return '—';
  try { return new Date(str.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }); } catch { return str; }
}

function StatCard({ label, value, sub, color = 'var(--accent)' }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '20px 24px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 900, color, letterSpacing: '-1px' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function MiniBar({ data, color }) {
  if (!data || !data.length) return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No data yet</div>;
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: '100%', borderRadius: 3,
            height: `${Math.max(4, (d.count / max) * 52)}px`,
            background: color || 'var(--accent)',
          }} title={`${d.day}: ${d.count}`} />
          <div style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {d.day?.slice(5)}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function login(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/admin/stats', {
        headers: { 'x-admin-password': password }
      });
      if (res.status === 401) { setError('Wrong password'); setLoading(false); return; }
      const json = await res.json();
      setData(json);
      setAuthed(true);
    } catch { setError('Failed to connect'); }
    setLoading(false);
  }

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/admin/stats', { headers: { 'x-admin-password': password } });
      const json = await res.json();
      setData(json);
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    if (!authed) return;
    const i = setInterval(refresh, 30000);
    return () => clearInterval(i);
  }, [authed]);

  if (!authed) return (
    <div className="page" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)', padding: '40px 48px',
        display: 'flex', flexDirection: 'column', gap: 20, minWidth: 320,
      }}>
        <div style={{ fontSize: 24, fontWeight: 900, textAlign: 'center' }}>🔐 Admin</div>
        <form onSubmit={login} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password" placeholder="Admin password" value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--font-main)' }}
          />
          {error && <div style={{ color: 'var(--red-col)', fontSize: 13 }}>{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Checking...' : 'Enter'}
          </button>
        </form>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← Back</button>
      </div>
    </div>
  );

  const { stats, recentGames, recentUsers, gamesByDay, usersByDay } = data || {};

  return (
    <div className="page" style={{ maxWidth: 1100, margin: '0 auto', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 26, fontWeight: 900 }}>📊 Admin Dashboard</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={loading}>
            {loading ? '...' : '↺ Refresh'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← Site</button>
        </div>
      </div>

      {/* Key stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <StatCard label="Total Players"  value={stats?.totalUsers}  sub="registered accounts"       color="var(--accent)"    />
        <StatCard label="Total Games"    value={stats?.totalGames}  sub="completed matches"         color="var(--gold)"      />
        <StatCard label="Today's Signups" value={stats?.todayUsers} sub="new players today"         color="var(--green)"     />
        <StatCard label="Today's Games"  value={stats?.todayGames}  sub="matches played today"      color="#8b5cf6"          />
        <StatCard label="Active (1hr)"   value={stats?.activeUsers} sub="recently seen players"     color="var(--green)"     />
        <StatCard label="Average ELO"    value={stats?.avgElo}      sub="across all players"        color="var(--gold)"      />
        <StatCard label="Total Wins"     value={stats?.totalWins}   sub="decisive games"            color="var(--accent)"    />
        <StatCard label="Total Draws"    value={stats?.totalDraws}  sub="drawn games"               color="var(--text-muted)" />
      </div>

      {/* Top player */}
      {stats?.topPlayer && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(129,182,76,0.1), rgba(129,182,76,0.03))',
          border: '1px solid rgba(129,182,76,0.3)', borderRadius: 'var(--radius-lg)',
          padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <span style={{ fontSize: 32 }}>🏆</span>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 2 }}>Top Rated Player</div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{stats.topPlayer.username} <span style={{ color: 'var(--gold)', fontSize: 16 }}>{stats.topPlayer.elo} ELO</span></div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{stats.topPlayer.wins} wins</div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Games per day (7d)</div>
          <MiniBar data={gamesByDay} color="var(--accent)" />
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>New players per day (7d)</div>
          <MiniBar data={usersByDay} color="var(--gold)" />
        </div>
      </div>

      {/* Recent games */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontSize: 15, fontWeight: 800 }}>
          🎮 Recent Games
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Red', 'Black', 'Result', 'Moves', 'ELO Δ Red', 'ELO Δ Black', 'Date'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(recentGames || []).map((g, i) => {
              const redChange   = (g.red_elo_after   || g.red_elo_before)   - g.red_elo_before;
              const blackChange = (g.black_elo_after || g.black_elo_before) - g.black_elo_before;
              return (
                <tr key={g.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                  <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600 }}>{g.red_username}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600 }}>{g.black_username}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 99, fontWeight: 700,
                      background: g.result === 'red_win' ? 'rgba(200,50,50,0.15)' : g.result === 'black_win' ? 'rgba(50,50,50,0.5)' : 'rgba(200,150,50,0.15)',
                      color: g.result === 'red_win' ? 'var(--red-col)' : g.result === 'black_win' ? '#aaa' : 'var(--gold)',
                    }}>
                      {g.result === 'red_win' ? `${g.red_username} won` : g.result === 'black_win' ? `${g.black_username} won` : 'Draw'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{g.moves_count}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, fontFamily: 'var(--font-mono)', color: redChange >= 0 ? 'var(--green)' : 'var(--red-col)', fontWeight: 700 }}>
                    {redChange >= 0 ? '+' : ''}{redChange}
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 13, fontFamily: 'var(--font-mono)', color: blackChange >= 0 ? 'var(--green)' : 'var(--red-col)', fontWeight: 700 }}>
                    {blackChange >= 0 ? '+' : ''}{blackChange}
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(g.completed_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Recent users */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontSize: 15, fontWeight: 800 }}>
          👥 Recent Signups
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Username', 'ELO', 'W', 'L', 'D', 'Games', 'Joined'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(recentUsers || []).map((u, i) => (
              <tr key={u.username} style={{ borderBottom: '1px solid var(--border)', background: i % 2 ? 'rgba(255,255,255,0.01)' : 'transparent', cursor: 'pointer' }}
                onClick={() => navigate(`/profile/${u.username}`)}>
                <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700 }}>{u.username}</td>
                <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{u.elo}</td>
                <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--green)' }}>{u.wins}</td>
                <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--red-col)' }}>{u.losses}</td>
                <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--text-muted)' }}>{u.draws}</td>
                <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{u.games_played}</td>
                <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}