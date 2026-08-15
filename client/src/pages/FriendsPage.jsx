import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { FlagImg } from './StatsPage';

const TIME_CONTROLS = [
  { id: 'bullet1', label: '1 min', category: 'Bullet', icon: '⚡' },
  { id: 'blitz3',  label: '3 min', category: 'Blitz',  icon: '🔥' },
  { id: 'blitz5',  label: '5 min', category: 'Blitz',  icon: '🔥' },
];

function ChallengeModal({ friend, onSend, onClose }) {
  const [tc, setTc] = useState('blitz5');
  const [rated, setRated] = useState(true);
  const opt = (sel, on) => ({
    flex: 1, padding: '12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'var(--font-main)',
    border: `2px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
    background: sel ? 'rgba(129,182,76,0.12)' : 'var(--bg-hover)',
    color: sel ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: sel ? 800 : 500, fontSize: 13,
  });
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 380, width: '100%' }}>
        <div className="modal-title" style={{ marginBottom: 2 }}>⚔️ Challenge {friend.username}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>{friend.elo} ELO</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>Time Control</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {TIME_CONTROLS.map(t => (
            <button key={t.id} className={`tc-btn${tc === t.id ? ' tc-active' : ''}`} style={{ flex: 1, minWidth: 0, padding: '10px 6px' }} onClick={() => setTc(t.id)}>
              <span className="tc-icon">{t.icon}</span><span className="tc-time" style={{ fontSize: 14 }}>{t.label}</span><span className="tc-cat">{t.category}</span>
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>Game Type</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <button style={opt(rated)} onClick={() => setRated(true)}>⭐ Rated<div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, opacity: .8 }}>ELO changes</div></button>
          <button style={opt(!rated)} onClick={() => setRated(false)}>🎮 Casual<div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, opacity: .8 }}>Just for fun</div></button>
        </div>
        <div className="modal-actions">
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onSend(tc, rated)}>Send Challenge</button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function Row({ children, style }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', ...style }}>{children}</div>;
}
function Av({ u }) {
  const a = localStorage.getItem(`avatar_${u.id}`);
  return <div className="lb-avatar" style={{ width: 36, height: 36, fontSize: 14, flexShrink: 0 }}>{a ? <img src={a} alt="" /> : u.username[0].toUpperCase()}</div>;
}
function Name({ u, online }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 14 }}>
        {online !== undefined && <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: online ? 'var(--green)' : '#555', boxShadow: online ? '0 0 6px var(--green)' : 'none' }} />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.username}</span>
        {u.country && <FlagImg code={u.country} size={13} />}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.elo} ELO{online !== undefined ? online ? ' · Online' : ' · Offline' : ''}</div>
    </div>
  );
}

export default function FriendsPage() {
  const { token } = useAuth();
  const { socket, onlineFriendIds, refreshPending } = useSocket();
  const navigate = useNavigate();

  const [tab, setTab] = useState('friends');
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [msg, setMsg] = useState(null);
  const [challenging, setChallenging] = useState(null);
  const [sentTo, setSentTo] = useState(null);
  const [loading, setLoading] = useState(true);

  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    try {
      const [f, r] = await Promise.all([
        fetch('/api/auth/friends', { headers: H }).then(x => x.json()),
        fetch('/api/auth/friends/requests', { headers: H }).then(x => x.json()),
      ]);
      setFriends(f.friends || []); setIncoming(r.incoming || []); setOutgoing(r.outgoing || []);
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!socket) return;
    const onSent = ({ friendId }) => { setSentTo(friendId); setTimeout(() => setSentTo(null), 4000); };
    const onFail = ({ reason }) => flash(reason, true);
    const onDecl = ({ by }) => flash(`${by} declined your challenge`, true);
    socket.on('challenge_sent', onSent); socket.on('challenge_failed', onFail); socket.on('challenge_declined', onDecl);
    return () => { socket.off('challenge_sent', onSent); socket.off('challenge_failed', onFail); socket.off('challenge_declined', onDecl); };
  }, [socket]);

  useEffect(() => {
    if (search.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try { const r = await fetch(`/api/auth/search-users?q=${encodeURIComponent(search)}`, { headers: H }).then(x => x.json()); setResults(r.users || []); } catch {}
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  function flash(text, err = false) { setMsg({ text, err }); setTimeout(() => setMsg(null), 3500); }
  async function sendRequest(username) {
    const r = await fetch('/api/auth/friends/request', { method: 'POST', headers: H, body: JSON.stringify({ username }) }).then(x => x.json());
    if (r.error) flash(r.error, true); else { flash(`Friend request sent to ${username}!`); load(); }
  }
  async function accept(id) { await fetch('/api/auth/friends/accept', { method: 'POST', headers: H, body: JSON.stringify({ friendshipId: id }) }); flash('Friend added!'); load(); refreshPending(); socket?.emit('get_online_friends'); }
  async function decline(id) { await fetch('/api/auth/friends/decline', { method: 'POST', headers: H, body: JSON.stringify({ friendshipId: id }) }); load(); refreshPending(); }
  async function remove(id, name) { if (!confirm(`Remove ${name} from friends?`)) return; await fetch('/api/auth/friends/remove', { method: 'POST', headers: H, body: JSON.stringify({ friendshipId: id }) }); load(); }
  function sendChallenge(tc, rated) { socket.emit('challenge_friend', { friendId: challenging.id, timeControlId: tc, rated }); setChallenging(null); }

  const isOnline = (id) => onlineFriendIds.has(id);
  const sortedFriends = [...friends].sort((a, b) => (isOnline(b.id) ? 1 : 0) - (isOnline(a.id) ? 1 : 0));

  const TABS = [
    { id: 'friends', label: `Friends (${friends.length})` },
    { id: 'requests', label: `Requests${incoming.length ? ` (${incoming.length})` : ''}` },
    { id: 'add', label: '+ Add Friend' },
  ];

  return (
    <div className="page">
      {challenging && <ChallengeModal friend={challenging} onSend={sendChallenge} onClose={() => setChallenging(null)} />}
      <div className="page-wrapper" style={{ maxWidth: 640 }}>
        <div className="page-top-bar">
          <div className="page-title"><span className="page-title-icon">👥</span> Friends</div>
        </div>

        {msg && (
          <div style={{ padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: msg.err ? 'rgba(200,50,50,0.12)' : 'rgba(129,182,76,0.12)', border: `1px solid ${msg.err ? 'rgba(200,50,50,0.3)' : 'rgba(129,182,76,0.3)'}`, color: msg.err ? 'var(--red-col)' : 'var(--accent)' }}>{msg.text}</div>
        )}

        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 4 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: '9px 6px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-main)', fontWeight: 700, fontSize: 13, background: tab === t.id ? 'var(--accent)' : 'transparent', color: tab === t.id ? '#000' : 'var(--text-secondary)', transition: 'all .15s' }}>{t.label}</button>
          ))}
        </div>

        {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="queue-spinner" style={{ margin: '0 auto' }} /></div> : (
          <>
            {tab === 'friends' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sortedFriends.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px', fontSize: 14 }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
                    No friends yet. <span style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => setTab('add')}>Add someone!</span>
                  </div>
                )}
                {sortedFriends.map(f => (
                  <Row key={f.id}>
                    <Av u={f} /><Name u={f} online={isOnline(f.id)} />
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {isOnline(f.id) ? (
                        <button className="btn btn-primary btn-sm" onClick={() => setChallenging(f)} disabled={sentTo === f.id}>{sentTo === f.id ? '✓ Sent' : '⚔️ Challenge'}</button>
                      ) : (
                        <button className="btn btn-ghost btn-sm" disabled style={{ opacity: .5 }}>Offline</button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/profile/${f.username}`)}>👤</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red-col)' }} onClick={() => remove(f.friendship_id, f.username)}>✕</button>
                    </div>
                  </Row>
                ))}
              </div>
            )}

            {tab === 'requests' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>Incoming ({incoming.length})</div>
                  {incoming.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>No pending requests</div> : incoming.map(r => (
                    <Row key={r.friendship_id} style={{ marginBottom: 8 }}>
                      <Av u={r} /><Name u={r} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => accept(r.friendship_id)}>Accept</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => decline(r.friendship_id)}>Decline</button>
                      </div>
                    </Row>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>Sent ({outgoing.length})</div>
                  {outgoing.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>No sent requests</div> : outgoing.map(r => (
                    <Row key={r.friendship_id} style={{ marginBottom: 8 }}>
                      <Av u={r} /><Name u={r} />
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pending...</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => decline(r.friendship_id)}>Cancel</button>
                    </Row>
                  ))}
                </div>
              </div>
            )}

            {tab === 'add' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input type="text" placeholder="Search by username..." value={search} onChange={e => setSearch(e.target.value)} autoFocus
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--font-main)', outline: 'none' }} />
                {searching && <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>Searching...</div>}
                {!searching && search.length >= 2 && results.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No players found for "{search}"</div>}
                {results.map(u => {
                  const isFriend = friends.some(f => f.id === u.id);
                  const isPending = outgoing.some(o => o.id === u.id) || incoming.some(i => i.id === u.id);
                  return (
                    <Row key={u.id}>
                      <Av u={u} /><Name u={u} />
                      {isFriend ? <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>✓ Friends</span>
                        : isPending ? <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pending</span>
                        : <button className="btn btn-primary btn-sm" onClick={() => sendRequest(u.username)}>+ Add</button>}
                    </Row>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}