import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { FlagImg } from '../pages/StatsPage';

function LogoSVG({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="nb1" cx="40%" cy="30%" r="65%"><stop offset="0%" stopColor="#5a5a5a"/><stop offset="50%" stopColor="#1a1a1a"/><stop offset="100%" stopColor="#080808"/></radialGradient>
        <radialGradient id="nb2" cx="38%" cy="30%" r="65%"><stop offset="0%" stopColor="#cc1a1a"/><stop offset="100%" stopColor="#6a0000"/></radialGradient>
        <filter id="nbs"><feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.7"/></filter>
      </defs>
      <ellipse cx="50" cy="58" rx="43" ry="9" fill="rgba(0,0,0,0.3)"/>
      <circle cx="50" cy="47" r="43" fill="url(#nb1)" filter="url(#nbs)"/>
      <circle cx="50" cy="47" r="36" fill="none" stroke="rgba(170,170,170,0.65)" strokeWidth="3.5"/>
      <circle cx="50" cy="47" r="31" fill="none" stroke="rgba(50,50,50,0.8)" strokeWidth="2"/>
      <circle cx="50" cy="47" r="25" fill="none" stroke="#cc1a1a" strokeWidth="4.5"/>
      <circle cx="50" cy="47" r="19" fill="url(#nb2)"/>
      <ellipse cx="37" cy="33" rx="12" ry="8" fill="rgba(255,255,255,0.22)" transform="rotate(-20 37 33)"/>
    </svg>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const { onlineCount } = useSocket();
  const navigate = useNavigate();

  return (
    <nav className="navbar">
      <div className="navbar-brand" onClick={() => navigate('/')}>
        <LogoSVG size={30} />
        <span className="navbar-brand-text">Checkers Online</span>
      </div>
      <div className="navbar-links">
        {user ? (
          <>
            <button className="navbar-link-btn" onClick={() => navigate('/leaderboard')}>🏆 Leaderboard</button>
            <button className="navbar-link-btn" onClick={() => navigate('/stats')}>📊 Stats</button>
            <div className="online-pill">
              <span className="online-dot" />
              <span>{onlineCount} online</span>
            </div>
            <div className="navbar-user-chip" onClick={() => navigate(`/profile/${user.username}`)}>
              <div className="navbar-avatar-sm">
                {user.avatar
                  ? <img src={user.avatar} alt={user.username} />
                  : user.username?.[0]?.toUpperCase()}
              </div>
              <span className="navbar-username">{user.username}</span>
              {user.country && <FlagImg code={user.country} size={14} style={{ borderRadius: 2 }} />}
              <span className="navbar-elo-badge">{user.elo}</span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => { logout(); navigate('/login'); }}>Log out</button>
          </>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/login')}>Sign In</button>
        )}
      </div>
    </nav>
  );
}