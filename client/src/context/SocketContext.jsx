import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token, isGuest } = useAuth();
  const [socket,          setSocket]          = useState(null);
  const [connected,       setConnected]       = useState(false);
  const [onlineCount,     setOnlineCount]     = useState(3100);
  const [onlineFriendIds, setOnlineFriendIds] = useState(new Set());
  const [pendingRequests, setPendingRequests] = useState(0);
  const [challenge,       setChallenge]       = useState(null);
  const socketRef = useRef(null);

  const refreshPending = useCallback(async () => {
    if (!token || isGuest) return;
    try {
      const r = await fetch('/api/auth/friends/requests', { headers: { Authorization: `Bearer ${token}` } }).then(x => x.json());
      setPendingRequests((r.incoming || []).length);
    } catch {}
  }, [token, isGuest]);

  useEffect(() => {
    if (!isGuest) return;
    function fetchCount() {
      fetch('/api/auth/online-count').then(r => r.json()).then(d => { if (d.count) setOnlineCount(d.count); }).catch(() => {});
    }
    fetchCount();
    const i = setInterval(fetchCount, 30000);
    return () => clearInterval(i);
  }, [isGuest]);

  useEffect(() => {
    if (!token || isGuest) return;
    if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }

    const s = io('/', { auth: { token }, transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 1000, reconnectionAttempts: 5 });

    s.on('connect', () => { setConnected(true); s.emit('get_online_friends'); refreshPending(); });
    s.on('disconnect', () => setConnected(false));
    s.on('online_count', (c) => setOnlineCount(c));
    s.on('online_friends', ({ onlineIds }) => setOnlineFriendIds(new Set(onlineIds)));
    s.on('friend_presence', ({ userId, online }) => {
      setOnlineFriendIds(prev => { const n = new Set(prev); online ? n.add(userId) : n.delete(userId); return n; });
    });
    s.on('challenge_received', (data) => setChallenge(data));

    socketRef.current = s;
    setSocket(s);
    return () => { s.disconnect(); socketRef.current = null; setSocket(null); setConnected(false); };
  }, [token, isGuest, refreshPending]);

  useEffect(() => {
    if (!token || isGuest) return;
    const i = setInterval(refreshPending, 30000);
    return () => clearInterval(i);
  }, [token, isGuest, refreshPending]);

  const clearChallenge = () => setChallenge(null);

  return (
    <SocketContext.Provider value={{ socket, connected, onlineCount, onlineFriendIds, pendingRequests, refreshPending, challenge, clearChallenge }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() { return useContext(SocketContext); }