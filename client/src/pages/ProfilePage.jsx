import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { COUNTRIES, FlagImg } from './StatsPage';

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr.replace(' ', 'T') + 'Z');
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  } catch { return ''; }
}

function Avatar({ user, size = 88, editable = false, onUpload }) {
  const fileRef = useRef(null);
  return (
    <div className="profile-avatar-wrap">
      <div className="profile-avatar" style={{ width: size, height: size }}
        onClick={() => editable && fileRef.current?.click()}>
        {user?.avatar ? <img src={user.avatar} alt={user.username} /> : <span>{user?.username?.[0]?.toUpperCase()}</span>}
      </div>
      {editable && (
        <>
          <div className="avatar-upload-btn" onClick={() => fileRef.current?.click()}>✏️</div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files[0]; if (!file) return;
              const reader = new FileReader();
              reader.onload = ev => onUpload(ev.target.result);
              reader.readAsDataURL(file);
            }} />
        </>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { username } = useParams();
  const { user: me, token, updateUser } = useAuth();
  const navigate = useNavigate();

  const [profile,  setProfile]  = useState(null);
  const [games,    setGames]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [savingCountry, setSavingCountry] = useState(false);

  const isMe = me?.username?.toLowerCase() === username?.toLowerCase();

  useEffect(() => {
    setLoading(true); setError(null); setProfile(null); setGames([]);
    fetch(`/api/auth/profile/${username}?t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' }
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        const stored = localStorage.getItem(`avatar_${data.user.id}`);
        setProfile({ ...data.user, avatar: stored || null });
        setGames(data.games || []);
      })
      .catch(() => setError('Failed to load profile'))
      .finally(() => setLoading(false));
  }, [username, token]);

  function handleAvatarUpload(dataUrl) {
    localStorage.setItem(`avatar_${me.id}`, dataUrl);
    updateUser({ avatar: dataUrl });
    setProfile(prev => ({ ...prev, avatar: dataUrl }));
  }

  async function handleSetCountry(code) {
    setSavingCountry(true);
    try {
      const res = await fetch('/api/auth/set-country', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ country: code || '' })
      });
      const data = await res.json();
      if (data.success !== false) {
        updateUser({ country: data.country });
        setProfile(prev => ({ ...prev, country: data.country }));
        setShowCountryPicker(false);
      }
    } catch (err) { console.error(err); }
    setSavingCountry(false);
  }

  if (loading) return <div className="page" style={{ justifyContent: 'center', alignItems: 'center', gap: 16 }}><div className="queue-spinner" /></div>;
  if (error || !profile) return (
    <div className="page" style={{ justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      <p style={{ color: 'var(--red-col)' }}>{error || 'Player not found.'}</p>
      <button className="btn btn-secondary" onClick={() => navigate('/')}>← Home</button>
    </div>
  );

  const winRate  = profile.games_played > 0 ? Math.round((profile.wins / profile.games_played) * 100) : 0;
  const eloTitle = profile.elo >= 1800 ? 'Master' : profile.elo >= 1600 ? 'Expert' : profile.elo >= 1400 ? 'Advanced' : profile.elo >= 1200 ? 'Intermediate' : 'Beginner';
  const countryObj = COUNTRIES.find(c => c.code === profile.country);

  return (
    <div className="page">
      <div className="profile-page">

        {/* Hero */}
        <div className="profile-hero">
          <Avatar user={profile} size={88} editable={isMe} onUpload={handleAvatarUpload} />
          <div className="profile-info">
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {profile.username}
              {profile.country && <FlagImg code={profile.country} size={22} />}
            </h1>
            <p className="profile-meta">Member since {formatDate(profile.created_at)}</p>
            <div className="profile-badges">
              <span className="badge badge-gold">⭐ {profile.elo} ELO</span>
              <span className="badge badge-green">{eloTitle}</span>
              {profile.wins >= 10 && <span className="badge badge-gold">🏆 {profile.wins} Wins</span>}
              {(profile.current_streak || 0) >= 3 && (
                <span className="badge badge-gold">🔥 {profile.current_streak} Streak</span>
              )}
            </div>

            {/* Country selector — own profile only */}
            {isMe && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowCountryPicker(p => !p)}
                  style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {countryObj
                    ? <><FlagImg code={countryObj.code} size={14} /> {countryObj.name}</>
                    : '🌍 Set your country'
                  }
                  {' '}▾
                </button>
                {profile.country && (
                  <button className="btn btn-ghost btn-sm" onClick={() => handleSetCountry('')}
                    style={{ fontSize: 11, color: 'var(--text-muted)' }}>✕ Remove</button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Country picker */}
        {isMe && showCountryPicker && (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
            padding: 16, display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 260, overflowY: 'auto',
          }}>
            <div style={{ width: '100%', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
              Select your country
            </div>
            {COUNTRIES.map(c => (
              <button
                key={c.code}
                disabled={savingCountry}
                onClick={() => handleSetCountry(c.code)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px',
                  borderRadius: 99,
                  border: `1px solid ${profile.country === c.code ? 'var(--accent)' : 'var(--border)'}`,
                  background: profile.country === c.code ? 'rgba(129,182,76,0.12)' : 'var(--bg-hover)',
                  color: profile.country === c.code ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-main)',
                  fontWeight: profile.country === c.code ? 700 : 400, transition: 'all 0.15s',
                }}
              >
                <FlagImg code={c.code} size={14} />
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Stats */}
        <div className="profile-stats">
          {[
            { label: 'Rating',   value: profile.elo,      color: 'var(--gold)'         },
            { label: 'Wins',     value: profile.wins,     color: 'var(--green)'        },
            { label: 'Losses',   value: profile.losses,   color: 'var(--red-col)'      },
            { label: 'Win Rate', value: `${winRate}%`,    color: 'var(--text-primary)' },
          ].map(s => (
            <div key={s.label} className="stat-box">
              <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Game history */}
        <div className="history-section">
          <h2>Recent Games <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}>({games.length})</span></h2>
          {games.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '24px 0', textAlign: 'center' }}>
              No completed games yet.{' '}
              <span style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={() => navigate('/')}>Play one!</span>
            </div>
          ) : (
            <div className="history-list">
              {games.map(g => {
                const isRed     = g.player_red_id === profile.id;
                const opponent  = isRed ? g.black_username : g.red_username;
                const oppCountry= isRed ? g.black_country  : g.red_country;
                const eloBefore = isRed ? g.red_elo_before   : g.black_elo_before;
                const eloAfter  = isRed ? g.red_elo_after    : g.black_elo_after;
                const eloChange = (eloAfter || eloBefore) - eloBefore;

                let resultLabel, resultClass;
                if      (g.result === 'draw')        { resultLabel = 'Draw';      resultClass = 'draw'; }
                else if (g.result === 'abandoned')   { resultLabel = 'Abandoned'; resultClass = 'draw'; }
                else if (g.winner_id === profile.id) { resultLabel = 'Win';       resultClass = 'win';  }
                else                                 { resultLabel = 'Loss';      resultClass = 'loss'; }

                return (
                  <div key={g.id} className="history-item">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="history-vs">vs </span>
                        <span className="history-opponent">{opponent || 'Unknown'}</span>
                        {oppCountry && <FlagImg code={oppCountry} size={13} />}
                      </div>
                      <div className="history-meta">
                        {g.moves_count || 0} moves
                        {g.completed_at ? ` · ${formatDate(g.completed_at)}` : ''}
                      </div>
                    </div>
                    <div className="history-right" style={{ gap: 8, flexShrink: 0 }}>
                      <span className="history-elo-change"
                        style={{ color: eloChange >= 0 ? 'var(--green)' : 'var(--red-col)', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700 }}>
                        {eloChange >= 0 ? '+' : ''}{eloChange}
                      </span>
                      <span className={`history-result ${resultClass}`}>{resultLabel}</span>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '4px 10px' }}
                        onClick={() => navigate(`/review/${g.id}`)}>▶ Review</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}