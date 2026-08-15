import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { FlagImg } from '../pages/StatsPage';

function LogoSVG({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <defs>
        <radialGradient id="sb1" cx="40%" cy="30%" r="65%"><stop offset="0%" stopColor="#5a5a5a"/><stop offset="50%" stopColor="#1a1a1a"/><stop offset="100%" stopColor="#080808"/></radialGradient>
        <radialGradient id="sb2" cx="38%" cy="30%" r="65%"><stop offset="0%" stopColor="#cc1a1a"/><stop offset="100%" stopColor="#6a0000"/></radialGradient>
      </defs>
      <circle cx="50" cy="47" r="43" fill="url(#sb1)"/>
      <circle cx="50" cy="47" r="36" fill="none" stroke="rgba(170,170,170,0.65)" strokeWidth="3.5"/>
      <circle cx="50" cy="47" r="25" fill="none" stroke="#cc1a1a" strokeWidth="4.5"/>
      <circle cx="50" cy="47" r="19" fill="url(#sb2)"/>
      <ellipse cx="37" cy="33" rx="12" ry="8" fill="rgba(255,255,255,0.22)" transform="rotate(-20 37 33)"/>
    </svg>
  );
}

const NAV = [
  { path: '/',            icon: '♟',  label: 'Play',        guest: true  },
  { path: '/friends',     icon: '👥', label: 'Friends',     guest: false },
  { path: '/leaderboard', icon: '🏆', label: 'Leaderboard', guest: true  },
  { path: '/stats',       icon: '📊', label: 'Stats',       guest: false },
];

export default function Sidebar() {
  const { user, logout, isGuest } = useAuth();
  const { onlineCount, pendingRequests } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) return null;
  const avatar = localStorage.getItem(`avatar_${user?.id}`);

  function go(item) {
    if (isGuest && !item.guest) { navigate('/login?signup=1'); return; }
    navigate(item.path);
  }
  const active = (p) => p === '/' ? location.pathname === '/' : location.pathname.startsWith(p);

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-logo" onClick={() => navigate('/')}>
          <LogoSVG size={32} />
          <span className="sidebar-logo-text">Checkers Online</span>
        </div>
        <nav className="sidebar-nav">
          {NAV.map(item => (
            <button key={item.path}
              className={`sidebar-item${active(item.path) ? ' active' : ''}${isGuest && !item.guest ? ' locked' : ''}`}
              onClick={() => go(item)}>
              <span className="sidebar-item-icon">{item.icon}</span>
              <span className="sidebar-item-label">{item.label}</span>
              {item.path === '/friends' && pendingRequests > 0 && <span className="sidebar-badge">{pendingRequests}</span>}
              {isGuest && !item.guest && <span className="sidebar-lock">🔒</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-online">
            <span className="online-dot" />
            <span>{onlineCount.toLocaleString()} online</span>
          </div>
          <div className="sidebar-user" onClick={() => isGuest ? navigate('/login?signup=1') : navigate(`/profile/${user.username}`)}>
            <div className="sidebar-avatar">
              {isGuest ? <span style={{ fontWeight: 900, color: '#000' }}>G</span> : avatar ? <img src={avatar} alt="" /> : user.username?.[0]?.toUpperCase()}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-username">
                {isGuest ? 'Guest' : user.username}
                {!isGuest && user.country && <FlagImg code={user.country} size={12} />}
              </div>
              <div className="sidebar-elo">
                {isGuest ? <span style={{ color: 'var(--accent)' }}>Sign up →</span> : `${user.elo} ELO`}
              </div>
            </div>
          </div>
          <button className="sidebar-logout" onClick={() => { logout(); navigate('/login'); }}>
            {isGuest ? '↩ Log In' : '↩ Log out'}
          </button>
        </div>
      </aside>

      <nav className="mobile-nav">
        {NAV.map(item => (
          <button key={item.path} className={`mobile-nav-item${active(item.path) ? ' active' : ''}`} onClick={() => go(item)}>
            <span className="mobile-nav-icon">{item.icon}</span>
            <span className="mobile-nav-label">{item.label}</span>
            {item.path === '/friends' && pendingRequests > 0 && <span className="sidebar-badge" style={{ position: 'absolute', top: 4, right: '20%' }}>{pendingRequests}</span>}
          </button>
        ))}
        <button className="mobile-nav-item" onClick={() => isGuest ? navigate('/login?signup=1') : navigate(`/profile/${user.username}`)}>
          <span className="mobile-nav-icon">
            {isGuest ? '👤' : avatar ? <img src={avatar} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} /> : '👤'}
          </span>
          <span className="mobile-nav-label">{isGuest ? 'Sign Up' : 'Profile'}</span>
        </button>
      </nav>
    </>
  );
}