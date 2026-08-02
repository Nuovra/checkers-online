import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser  = localStorage.getItem('user');
    const guestMode  = localStorage.getItem('guestMode');

    if (guestMode === 'true') {
      setIsGuest(true);
      setUser({ username: 'Guest', elo: 1200, isGuest: true });
      setLoading(false);
      return;
    }

    if (savedToken && savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUser(parsed);
        setToken(savedToken);
        // Verify token is still valid
        fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${savedToken}` }
        })
          .then(r => r.json())
          .then(data => {
            if (data.user) {
              setUser(data.user);
              localStorage.setItem('user', JSON.stringify(data.user));
            } else {
              logout();
            }
          })
          .catch(() => {})
          .finally(() => setLoading(false));
      } catch {
        logout();
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  function login(newToken, newUser) {
    setToken(newToken);
    setUser(newUser);
    setIsGuest(false);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    localStorage.removeItem('guestMode');
  }

  function loginAsGuest() {
    setIsGuest(true);
    setUser({ username: 'Guest', elo: 1200, isGuest: true });
    localStorage.setItem('guestMode', 'true');
  }

  function logout() {
    setToken(null);
    setUser(null);
    setIsGuest(false);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('guestMode');
  }

  function updateUser(updates) {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      if (!isGuest) localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  }

  function refreshUser() {
    if (!token || isGuest) return;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (data.user) { setUser(data.user); localStorage.setItem('user', JSON.stringify(data.user)); } })
      .catch(() => {});
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, isGuest, login, loginAsGuest, logout, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }