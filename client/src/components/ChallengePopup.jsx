import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';

export default function ChallengePopup() {
  const { socket, challenge, clearChallenge } = useSocket();
  const navigate = useNavigate();
  if (!challenge) return null;

  function accept() {
    socket.emit('challenge_accept', { challengerId: challenge.challengerId, timeControlId: challenge.timeControlId, rated: challenge.rated });
    clearChallenge();
  }
  function decline() {
    socket.emit('challenge_decline', { challengerId: challenge.challengerId });
    clearChallenge();
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 2000 }}>
      <div className="modal-box" style={{ maxWidth: 380, textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 8 }}>⚔️</div>
        <div className="modal-title" style={{ marginBottom: 6 }}>Challenge Received!</div>
        <p style={{ fontSize: 15, marginBottom: 4 }}>
          <strong style={{ color: 'var(--accent)' }}>{challenge.challengerName}</strong>
          <span style={{ color: 'var(--text-muted)' }}> ({challenge.challengerElo} ELO)</span> wants to play
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20, marginTop: 12 }}>
          <span className="badge badge-gold">{challenge.timeControlName}</span>
          <span className={`badge ${challenge.rated ? 'badge-gold' : 'badge-green'}`}>{challenge.rated ? '⭐ Rated' : '🎮 Casual'}</span>
        </div>
        <div className="modal-actions">
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={accept}>Accept</button>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={decline}>Decline</button>
        </div>
      </div>
    </div>
  );
}