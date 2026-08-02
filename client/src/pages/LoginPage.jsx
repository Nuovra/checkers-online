import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const [isSignup, setIsSignup] = useState(searchParams.get('signup') === '1');
  const [username, setUsername] = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const { login, loginAsGuest, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && !user.isGuest) navigate('/');
  }, [user]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const endpoint = isSignup ? '/api/auth/register' : '/api/auth/login';
      const body     = isSignup ? { username, email, password } : { username, password };
      const res  = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setLoading(false); return; }
      login(data.token, data.user);
      navigate('/');
    } catch {
      setError('Connection error. Please try again.');
      setLoading(false);
    }
  }

  function handleGuest() {
    loginAsGuest();
    navigate('/play');
  }

  return (
    <div className="page auth-page">
      <div className="auth-container">
        <div className="auth-logo">
          <div style={{
            width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #1a1a1a, #2a2a2a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 32px rgba(129,182,76,0.3)',
          }}>
            <svg width="36" height="36" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="43" fill="#111"/>
              <circle cx="50" cy="50" r="35" fill="none" stroke="rgba(170,170,170,0.5)" strokeWidth="4"/>
              <circle cx="50" cy="50" r="25" fill="none" stroke="#cc1a1a" strokeWidth="5"/>
              <circle cx="50" cy="50" r="17" fill="#cc1a1a"/>
            </svg>
          </div>
          <h1>Checkers Online</h1>
          <p>The #1 free checkers game</p>
        </div>

        {/* Guest play CTA */}
        <div style={{
          background: 'rgba(129,182,76,0.08)', border: '1px solid rgba(129,182,76,0.2)',
          borderRadius: 'var(--radius-lg)', padding: '16px 20px', textAlign: 'center', marginBottom: 4,
        }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>
            🎮 Try it first — no account needed
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
            Play a quick game against our AI bot instantly
          </div>
          <button className="btn btn-primary" style={{ width: '100%', padding: '12px' }} onClick={handleGuest}>
            ▶ Play as Guest
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <div className="auth-card">
          <div className="auth-tabs">
            <button className={`auth-tab${!isSignup?' active':''}`} onClick={() => { setIsSignup(false); setError(''); }}>
              Log In
            </button>
            <button className={`auth-tab${isSignup?' active':''}`} onClick={() => { setIsSignup(true); setError(''); }}>
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label>Username</label>
              <input type="text" placeholder="Enter username" value={username}
                onChange={e => setUsername(e.target.value)} required autoFocus />
            </div>

            {isSignup && (
              <div className="form-group">
                <label>Email</label>
                <input type="email" placeholder="Enter email" value={email}
                  onChange={e => setEmail(e.target.value)} required />
              </div>
            )}

            <div className="form-group">
              <label>Password</label>
              <input type="password" placeholder="Enter password" value={password}
                onChange={e => setPassword(e.target.value)} required />
            </div>

            {error && <div className="auth-error">{error}</div>}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px' }} disabled={loading}>
              {loading ? 'Please wait...' : isSignup ? 'Create Account' : 'Log In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}