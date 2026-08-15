import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Sidebar from './components/Sidebar';
import ChallengePopup from './components/ChallengePopup';
import LoginPage from './pages/LoginPage';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import BotGamePage from './pages/BotGamePage';
import GuestGamePage from './pages/GuestGamePage';
import ProfilePage from './pages/ProfilePage';
import LeaderboardPage from './pages/LeaderboardPage';
import StatsPage from './pages/StatsPage';
import GameReviewPage from './pages/GameReviewPage';
import AdminPage from './pages/AdminPage';
import FriendsPage from './pages/FriendsPage';

function Spinner() { return <div className="page" style={{ justifyContent: 'center', alignItems: 'center' }}><div className="queue-spinner" /></div>; }

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function LoggedInOnly({ children }) {
  const { user, loading, isGuest } = useAuth();
  if (loading) return <Spinner />;
  if (!user || isGuest) return <Navigate to="/login?signup=1" replace />;
  return children;
}

function AppRoutes() {
  const { loading, user } = useAuth();
  if (loading) return <Spinner />;
  return (
    <div className="app-shell">
      {user && <Sidebar />}
      {user && <ChallengePopup />}
      <main className={`app-main${user ? ' with-sidebar' : ''}`}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/play" element={<GuestGamePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
          <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />
          <Route path="/friends" element={<LoggedInOnly><FriendsPage /></LoggedInOnly>} />
          <Route path="/game" element={<LoggedInOnly><GamePage /></LoggedInOnly>} />
          <Route path="/game/bot" element={<LoggedInOnly><BotGamePage /></LoggedInOnly>} />
          <Route path="/review/:gameId" element={<LoggedInOnly><GameReviewPage /></LoggedInOnly>} />
          <Route path="/profile/:username" element={<LoggedInOnly><ProfilePage /></LoggedInOnly>} />
          <Route path="/stats" element={<LoggedInOnly><StatsPage /></LoggedInOnly>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <AppRoutes />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}