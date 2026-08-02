import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token, isGuest } = useAuth();
  const [socket,      setSocket]      = useState(null);
  const [connected,   setConnected]   = useState(false);
  const [onlineCount, setOnlineCount] = useState(3100);
  const socketRef = useRef(null);

  // For guests — poll the REST endpoint for online count
  useEffect(() => {
    if (!isGuest) return;

    function fetchCount() {
      fetch('/api/auth/online-count')
        .then(r => r.json())
        .then(data => { if (data.count) setOnlineCount(data.count); })
        .catch(() => {});
    }

    fetchCount();
    const i = setInterval(fetchCount, 30000);
    return () => clearInterval(i);
  }, [isGuest]);

  // For logged in users — use socket
  useEffect(() => {
    if (!token || isGuest) return;

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    const newSocket = io('/', {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    newSocket.on('connect',       () => setConnected(true));
    newSocket.on('disconnect',    () => setConnected(false));
    newSocket.on('online_count',  (count) => setOnlineCount(count));

    socketRef.current = newSocket;
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      socketRef.current = null;
      setSocket(null);
      setConnected(false);
    };
  }, [token, isGuest]);

  return (
    <SocketContext.Provider value={{ socket, connected, onlineCount }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() { return useContext(SocketContext); }