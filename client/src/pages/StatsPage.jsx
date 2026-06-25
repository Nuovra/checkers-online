import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const COUNTRIES = [
  { code: 'US', name: 'United States'   },
  { code: 'GB', name: 'United Kingdom'  },
  { code: 'CA', name: 'Canada'          },
  { code: 'AU', name: 'Australia'       },
  { code: 'DE', name: 'Germany'         },
  { code: 'FR', name: 'France'          },
  { code: 'ES', name: 'Spain'           },
  { code: 'IT', name: 'Italy'           },
  { code: 'BR', name: 'Brazil'          },
  { code: 'MX', name: 'Mexico'          },
  { code: 'AR', name: 'Argentina'       },
  { code: 'CO', name: 'Colombia'        },
  { code: 'CL', name: 'Chile'           },
  { code: 'PE', name: 'Peru'            },
  { code: 'VE', name: 'Venezuela'       },
  { code: 'CU', name: 'Cuba'            },
  { code: 'DO', name: 'Dominican Rep.'  },
  { code: 'PR', name: 'Puerto Rico'     },
  { code: 'JM', name: 'Jamaica'         },
  { code: 'TT', name: 'Trinidad'        },
  { code: 'HT', name: 'Haiti'           },
  { code: 'RU', name: 'Russia'          },
  { code: 'CN', name: 'China'           },
  { code: 'JP', name: 'Japan'           },
  { code: 'KR', name: 'South Korea'     },
  { code: 'IN', name: 'India'           },
  { code: 'PK', name: 'Pakistan'        },
  { code: 'NG', name: 'Nigeria'         },
  { code: 'GH', name: 'Ghana'           },
  { code: 'ZA', name: 'South Africa'    },
  { code: 'EG', name: 'Egypt'           },
  { code: 'TR', name: 'Turkey'          },
  { code: 'SA', name: 'Saudi Arabia'    },
  { code: 'AE', name: 'UAE'             },
  { code: 'IL', name: 'Israel'          },
  { code: 'NL', name: 'Netherlands'     },
  { code: 'SE', name: 'Sweden'          },
  { code: 'NO', name: 'Norway'          },
  { code: 'PL', name: 'Poland'          },
  { code: 'PT', name: 'Portugal'        },
  { code: 'NZ', name: 'New Zealand'     },
  { code: 'PH', name: 'Philippines'     },
  { code: 'ID', name: 'Indonesia'       },
  { code: 'TH', name: 'Thailand'        },
  { code: 'VN', name: 'Vietnam'         },
  { code: 'UA', name: 'Ukraine'         },
];

// Returns an <img> element with the flag — uses flagcdn.com which works on all platforms
export function FlagImg({ code, size = 20, style = {} }) {
  if (!code) return null;
  return (
    <img
      src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
      alt={code}
      style={{ width: size * 1.33, height: size, objectFit: 'cover', borderRadius: 2, display: 'inline-block', verticalAlign: 'middle', ...style }}
      onError={e => { e.target.style.display = 'none'; }}
    />
  );
}

// Keep this export so existing imports don't break — returns empty string
export function getFlagEmoji() { return ''; }

export default function StatsPage() {
  const { user, token, updateUser } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  if (!user) return null;

  const winRate   = user.games_played > 0 ? Math.round((user.wins   / user.games_played) * 100) : 0;
  const lossRate  = user.games_played > 0 ? Math.round((user.losses / user.games_played) * 100) : 0;
  const drawRate  = user.games_played > 0 ? Math.round((user.draws  / user.games_played) * 100) : 0;
  const eloClass  = user.elo >= 1800 ? 'Master' : user.elo >= 1600 ? 'Expert' : user.elo >= 1400 ? 'Advanced' : user.elo >= 1200 ? 'Intermediate' : 'Beginner';
  const curStreak = user.current_streak || 0;
  const bestStreak= user.best_streak    || 0;

  async function setCountry(code) {
    setSaving(true);
    try {
      const res = await fetch('/api/auth/set-country', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ country: code || '' })
      });
      const data = await res.json();
      if (data.success !== false) {
        updateUser({ country: data.country });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) { console.error(err); }
    setSaving(false);
  }

  const currentCountry = COUNTRIES.find(c => c.code === user.country);

  return (
    <div className="page">
      <div className="stats-page">
        <div className="page-top-bar">
          <div className="page-title"><span className="page-title-icon">📊</span> Your Stats</div>
          <button className="close-btn" onClick={() => navigate('/')}>✕</button>
        </div>

        {/* Rank card */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(129,182,76,0.1), rgba(129,182,76,0.03))',
          border: '1px solid rgba(129,182,76,0.25)', borderRadius: 'var(--radius-xl)',
          padding: '24px 28px', display: 'flex', alignItems: 'center', gap: 20,
        }}>
          <div style={{
            width: 68, height: 68, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
            background: 'linear-gradient(135deg, var(--accent-dark), var(--accent))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, fontWeight: 900, color: '#0d0d0d', boxShadow: '0 0 24px rgba(129,182,76,0.3)',
          }}>
            {user.avatar
              ? <img src={user.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : user.username[0].toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: 10 }}>
              {user.username}
              {user.country && <FlagImg code={user.country} size={18} />}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 3 }}>{eloClass} · {user.elo} ELO</div>
            <div style={{ marginTop: 10, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3, transition: 'width 1s ease',
                width: `${Math.min(100, ((user.elo - 800) / (2000 - 800)) * 100)}%`,
                background: 'linear-gradient(90deg, var(--accent-dark), var(--accent))',
              }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Progress to next rank</div>
          </div>
        </div>

        {/* Streak banner */}
        {curStreak >= 2 && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(232,184,48,0.12), rgba(232,184,48,0.04))',
            border: '1px solid rgba(232,184,48,0.3)', borderRadius: 'var(--radius-lg)',
            padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <span style={{ fontSize: 32 }}>🔥</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--gold)' }}>{curStreak} Win Streak!</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Keep it going!</div>
            </div>
          </div>
        )}

        {/* Stats grid */}
        <div className="stats-grid">
          {[
            { label: 'ELO Rating',     value: user.elo,          color: 'var(--gold)',          sub: eloClass,                   bar: null     },
            { label: 'Games Played',   value: user.games_played, color: 'var(--text-primary)',  sub: 'Total matches',             bar: null     },
            { label: 'Wins',           value: user.wins,         color: 'var(--green)',          sub: `${winRate}% win rate`,     bar: winRate  },
            { label: 'Losses',         value: user.losses,       color: 'var(--red-col)',        sub: `${lossRate}% loss rate`,   bar: lossRate },
            { label: 'Draws',          value: user.draws,        color: 'var(--gold)',           sub: `${drawRate}% draw rate`,   bar: drawRate },
            { label: 'Win Rate',       value: `${winRate}%`,     color: winRate >= 50 ? 'var(--green)' : 'var(--text-secondary)', sub: 'Overall performance', bar: winRate },
            { label: 'Current Streak', value: curStreak > 0 ? `${curStreak} 🔥` : 0,   color: curStreak  > 0 ? 'var(--gold)'   : 'var(--text-muted)', sub: curStreak  > 0 ? 'Active streak'              : 'No active streak',           bar: null },
            { label: 'Best Streak',    value: bestStreak > 0 ? `${bestStreak} ⭐` : '—', color: bestStreak > 0 ? 'var(--accent)' : 'var(--text-muted)', sub: 'Personal best wins in a row', bar: null },
          ].map(s => (
            <div key={s.label} className="stats-card">
              <div className="stats-card-label">{s.label}</div>
              <div className="stats-card-value" style={{ color: s.color, fontSize: 30 }}>{s.value}</div>
              {s.bar !== null && (
                <div className="win-rate-bar">
                  <div className="win-rate-fill" style={{ width: `${s.bar}%`, background: `linear-gradient(90deg, ${s.color}88, ${s.color})` }} />
                </div>
              )}
              <div className="stats-card-sub">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Country selector */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
            🌍 Your Country
            {saved && <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 400 }}>✓ Saved!</span>}
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Your flag will appear next to your name in the navbar, leaderboard, and during matches.
            {currentCountry && <> Currently set to <strong style={{ color: 'var(--text-primary)' }}>{currentCountry.name}</strong>.</>}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 260, overflowY: 'auto', paddingRight: 4 }}>
            {COUNTRIES.map(c => (
              <button
                key={c.code}
                disabled={saving}
                onClick={() => setCountry(c.code)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                  borderRadius: 99,
                  border: `1px solid ${user.country === c.code ? 'var(--accent)' : 'var(--border)'}`,
                  background: user.country === c.code ? 'rgba(129,182,76,0.12)' : 'var(--bg-hover)',
                  color: user.country === c.code ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-main)',
                  fontWeight: user.country === c.code ? 700 : 400, transition: 'all 0.15s',
                }}
              >
                <FlagImg code={c.code} size={16} />
                {c.name}
              </button>
            ))}
          </div>

          {user.country && (
            <button
              onClick={() => setCountry('')}
              style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-main)' }}
            >
              ✕ Remove flag
            </button>
          )}
        </div>
      </div>
    </div>
  );
}