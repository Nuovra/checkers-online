import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

function LogoSVG() {
  return (
    <svg width="88" height="88" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="lg1" cx="40%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#5a5a5a"/>
          <stop offset="50%" stopColor="#1a1a1a"/>
          <stop offset="100%" stopColor="#080808"/>
        </radialGradient>
        <radialGradient id="lg2" cx="38%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#cc1a1a"/>
          <stop offset="100%" stopColor="#6a0000"/>
        </radialGradient>
        <filter id="lgs">
          <feDropShadow dx="0" dy="4" stdDeviation="5" floodOpacity="0.7"/>
        </filter>
      </defs>
      <ellipse cx="50" cy="59" rx="43" ry="9" fill="rgba(0,0,0,0.3)"/>
      <circle cx="50" cy="47" r="43" fill="url(#lg1)" filter="url(#lgs)"/>
      <circle cx="50" cy="47" r="36" fill="none" stroke="rgba(170,170,170,0.65)" strokeWidth="3.5"/>
      <circle cx="50" cy="47" r="31" fill="none" stroke="rgba(50,50,50,0.8)" strokeWidth="2"/>
      <circle cx="50" cy="47" r="25" fill="none" stroke="#cc1a1a" strokeWidth="4.5"/>
      <circle cx="50" cy="47" r="19" fill="url(#lg2)"/>
      <ellipse cx="37" cy="33" rx="12" ry="8" fill="rgba(255,255,255,0.22)" transform="rotate(-20 37 33)"/>
    </svg>
  );
}

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e?.preventDefault();
    setError(''); setLoading(true);
    try {
      if (mode === 'login') await login(username, password);
      else await register(username, email, password);
    } catch (err) { setError(err.message); }
    setLoading(false);
  }

  return (
    <div className="page auth-page">
      <div className="auth-container">
        <div className="auth-logo">
          <LogoSVG />
          <h1>Checkers Online</h1>
          <p>Play ranked checkers against real players</p>
        </div>

        <div className="auth-card">
          <div className="auth-tabs">
            <button className={`auth-tab${mode === 'login' ? ' active' : ''}`} onClick={() => { setMode('login'); setError(''); }}>Log In</button>
            <button className={`auth-tab${mode === 'register' ? ' active' : ''}`} onClick={() => { setMode('register'); setError(''); }}>Sign Up</button>
          </div>
          <div className="auth-divider" />
          <div className="form-group">
            <label>Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter your username" autoFocus />
          </div>
          {mode === 'register' && (
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter your email" />
            </div>
          )}
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" onKeyDown={e => e.key === 'Enter' && handleSubmit(e)} />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 4, padding: '12px' }} onClick={handleSubmit} disabled={loading}>
            {loading ? 'Loading...' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>
  );
}