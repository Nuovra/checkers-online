import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);
const API_BASE = '/api/auth';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) fetchMe();
    else setLoading(false);
  }, [token]);

  async function fetchMe() {
    try {
      const res = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.user) {
        const stored = localStorage.getItem(`avatar_${data.user.id}`);
        setUser({ ...data.user, avatar: stored || null });
      } else {
        setToken(null);
        localStorage.removeItem('token');
      }
    } catch {
      setToken(null);
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  }

  async function login(username, password) {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem('token', data.token);
    setToken(data.token);
    const stored = localStorage.getItem(`avatar_${data.user.id}`);
    setUser({ ...data.user, avatar: stored || null });
    return data;
  }

  async function register(username, email, password) {
    const res = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser({ ...data.user, avatar: null });
    return data;
  }

  function logout() {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }

  async function refreshUser() {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.user) {
        const stored = localStorage.getItem(`avatar_${data.user.id}`);
        setUser(prev => ({ ...data.user, avatar: stored || prev?.avatar || null }));
      }
    } catch {}
  }

  function updateUser(updates) {
    setUser(prev => prev ? { ...prev, ...updates } : null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshUser, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}