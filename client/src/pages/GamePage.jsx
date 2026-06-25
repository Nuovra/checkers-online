import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import Board from '../components/Board';
import { moveToString } from '../utils/helpers';
import { FlagImg } from './StatsPage';

function formatClock(ms) {
  if (ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function PlayerBar({ player, color, isActive, time, isLowTime, isMe, avatar, country }) {
  return (
    <div className={`player-bar${isActive ? ' active' : ''}`}>
      <div className="player-bar-left">
        <div className="player-bar-avatar">
          {avatar ? <img src={avatar} alt={player.username} /> : <span>{player.username[0].toUpperCase()}</span>}
        </div>
        <div className="player-bar-info">
          <div className="player-bar-name">
            <span className={`color-dot ${color}`} />
            {player.username}{isMe ? ' (You)' : ''}
            {country && <FlagImg code={country} size={13} style={{ marginLeft: 3 }} />}
          </div>
          <div className="player-bar-rating">{player.elo} ELO</div>
        </div>
      </div>
      <div className={`clock${isActive ? ' clock-active' : ''}${isLowTime ? ' clock-low' : ''}`}>
        {formatClock(time)}
      </div>
    </div>
  );
}

function Modal({ show, title, message, onConfirm, onCancel, confirmLabel = 'Confirm', cancelLabel = 'Cancel', confirmClass = 'btn-danger' }) {
  if (!show) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-title">{title}</div>
        {message && <div className="modal-message">{message}</div>}
        <div className="modal-actions">
          <button className={`btn ${confirmClass}`} onClick={onConfirm}>{confirmLabel}</button>
          <button className="btn btn-secondary" onClick={onCancel}>{cancelLabel}</button>
        </div>
      </div>
    </div>
  );
}

export default function GamePage() {
  const { user, refreshUser } = useAuth();
  const { socket } = useSocket();
  const location = useLocation();
  const navigate = useNavigate();

  const [game, setGame] = useState(() => location.state?.gameData || null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [drawOffer, setDrawOffer] = useState(null);
  const [resultData, setResultData] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [redTime, setRedTime] = useState(0);
  const [blackTime, setBlackTime] = useState(0);
  const [showResignModal, setShowResignModal] = useState(false);
  const [showDrawModal, setShowDrawModal] = useState(false);
  const [rematchOffer, setRematchOffer] = useState(null);
  const [rematchDeclined, setRematchDeclined] = useState(false);
  const [rematchPending, setRematchPending] = useState(false);
  const [playerCountries, setPlayerCountries] = useState({});

  const prevMoveCount = useRef(0);
  const chatEndRef = useRef(null);
  const localTimerRef = useRef(null);

  useEffect(() => {
    if (!game) return;
    setRedTime(game.redTime || 0);
    setBlackTime(game.blackTime || 0);
  }, [game?.id]);

  useEffect(() => {
    if (!game || game.status !== 'active') {
      if (localTimerRef.current) clearInterval(localTimerRef.current);
      return;
    }
    if (localTimerRef.current) clearInterval(localTimerRef.current);
    localTimerRef.current = setInterval(() => {
      if (game.turn === 'red') setRedTime(t => Math.max(0, t - 100));
      else setBlackTime(t => Math.max(0, t - 100));
    }, 100);
    return () => { if (localTimerRef.current) clearInterval(localTimerRef.current); };
  }, [game?.turn, game?.status]);

  useEffect(() => {
    if (game && game.moves && game.moves.length > prevMoveCount.current) {
      setLastMove(game.moves[game.moves.length - 1]);
      prevMoveCount.current = game.moves.length;
    }
  }, [game?.moves?.length]);

  // Fetch countries for both players when game starts
  useEffect(() => {
    if (!game) return;
    const players = [game.redPlayer, game.blackPlayer];
    players.forEach(p => {
      fetch(`/api/auth/profile/${p.username}`)
        .then(r => r.json())
        .then(data => {
          if (data.user?.country) {
            setPlayerCountries(prev => ({ ...prev, [p.id]: data.user.country }));
          }
        })
        .catch(() => {});
    });
  }, [game?.id]);

  useEffect(() => {
    if (!socket) return;
    if (!game) { navigate('/'); return; }

    function onGameUpdate(data) { setGame(data); setRedTime(data.redTime); setBlackTime(data.blackTime); }
    function onTimerUpdate({ redTime: rt, blackTime: bt }) { setRedTime(rt); setBlackTime(bt); }
    function onGameOver(data) {
      setGame(data); setResultData(data.resultData);
      if (localTimerRef.current) clearInterval(localTimerRef.current);
      refreshUser();
    }
    function onDrawOffered({ from }) { setDrawOffer(from); }
    function onDrawDeclined() { setDrawOffer(null); setChatMessages(prev => [...prev, { from: 'System', message: 'Draw offer declined.', timestamp: Date.now() }]); }
    function onChatMsg(msg) { setChatMessages(prev => [...prev, msg]); }
    function onOpponentDisconnected() { setChatMessages(prev => [...prev, { from: 'System', message: 'Opponent disconnected. 60s to reconnect...', timestamp: Date.now() }]); }
    function onGameStarted(data) {
      setGame(data); setRedTime(data.redTime); setBlackTime(data.blackTime);
      setResultData(null); setRematchPending(false); setRematchOffer(null);
      setRematchDeclined(false); prevMoveCount.current = 0; setLastMove(null);
    }
    function onRematchOffered({ from }) { setRematchOffer(from); }
    function onRematchDeclined() { setRematchDeclined(true); setRematchPending(false); }

    socket.on('game_update', onGameUpdate);
    socket.on('timer_update', onTimerUpdate);
    socket.on('game_over', onGameOver);
    socket.on('draw_offered', onDrawOffered);
    socket.on('draw_declined', onDrawDeclined);
    socket.on('game_chat_msg', onChatMsg);
    socket.on('opponent_disconnected', onOpponentDisconnected);
    socket.on('game_started', onGameStarted);
    socket.on('rematch_offered', onRematchOffered);
    socket.on('rematch_declined', onRematchDeclined);

    return () => {
      socket.off('game_update', onGameUpdate);
      socket.off('timer_update', onTimerUpdate);
      socket.off('game_over', onGameOver);
      socket.off('draw_offered', onDrawOffered);
      socket.off('draw_declined', onDrawDeclined);
      socket.off('game_chat_msg', onChatMsg);
      socket.off('opponent_disconnected', onOpponentDisconnected);
      socket.off('game_started', onGameStarted);
      socket.off('rematch_offered', onRematchOffered);
      socket.off('rematch_declined', onRematchDeclined);
    };
  }, [socket, game?.id]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  if (!game) return null;

  const myColor    = game.myColor;
  const opponent   = myColor === 'red' ? game.blackPlayer : game.redPlayer;
  const me         = myColor === 'red' ? game.redPlayer   : game.blackPlayer;
  const isGameOver = game.status === 'finished';
  const topColor   = myColor === 'red' ? 'black' : 'red';
  const bottomColor = myColor;
  const topTime    = topColor === 'red' ? redTime : blackTime;
  const bottomTime = bottomColor === 'red' ? redTime : blackTime;
  const topLow     = topTime    < 30000 && game.turn === topColor    && !isGameOver;
  const bottomLow  = bottomTime < 30000 && game.turn === bottomColor && !isGameOver;

  const myAvatar   = localStorage.getItem(`avatar_${me.id}`);
  const oppAvatar  = localStorage.getItem(`avatar_${opponent.id}`);
  const myCountry  = playerCountries[me.id]       || user?.country || null;
  const oppCountry = playerCountries[opponent.id]  || null;

  function handleMove(from, to) { if (!socket || isGameOver) return; socket.emit('make_move', { gameId: game.id, from, to }); }
  function confirmResign() { if (!socket) return; socket.emit('resign', { gameId: game.id }); setShowResignModal(false); }
  function confirmOfferDraw() { if (!socket) return; socket.emit('offer_draw', { gameId: game.id }); setShowDrawModal(false); }
  function handleAcceptDraw() { if (!socket) return; socket.emit('accept_draw', { gameId: game.id }); setDrawOffer(null); }
  function handleDeclineDraw() { if (!socket) return; socket.emit('decline_draw', { gameId: game.id }); setDrawOffer(null); }
  function handleRequestRematch() { if (!socket) return; socket.emit('request_rematch', { gameId: game.id }); setRematchPending(true); }
  function handleAcceptRematch() { if (!socket) return; socket.emit('accept_rematch', { gameId: game.id }); setRematchOffer(null); }
  function handleDeclineRematch() { if (!socket) return; socket.emit('decline_rematch', { gameId: game.id }); setRematchOffer(null); }
  function handleChat(e) {
    e.preventDefault();
    if (!socket || !chatInput.trim()) return;
    socket.emit('game_chat', { gameId: game.id, message: chatInput.trim() });
    setChatInput('');
  }

  let resultText = '', resultEmoji = '', eloChangeText = '', eloChangeClass = '';
  if (resultData) {
    const myEloChange = myColor === 'red' ? resultData.redEloChange : resultData.blackEloChange;
    if (resultData.result === 'draw') { resultText = 'Draw!'; resultEmoji = '🤝'; }
    else if ((resultData.result === 'red_win' && myColor === 'red') || (resultData.result === 'black_win' && myColor === 'black')) { resultText = 'You Win!'; resultEmoji = '🏆'; }
    else if (resultData.result === 'abandoned') { resultText = 'Abandoned'; resultEmoji = '🚪'; }
    else { resultText = 'You Lose'; resultEmoji = '😔'; }
    eloChangeText  = myEloChange >= 0 ? `+${myEloChange}` : `${myEloChange}`;
    eloChangeClass = myEloChange >= 0 ? 'positive' : 'negative';
  }

  const movePairs = [];
  if (game.moves) {
    for (let i = 0; i < game.moves.length; i += 2) {
      movePairs.push({ num: Math.floor(i / 2) + 1, red: game.moves[i], black: game.moves[i + 1] });
    }
  }

  return (
    <div className="page game-page">
      <Modal show={showResignModal} title="Resign Game?" message="Are you sure? You will lose ELO."
        onConfirm={confirmResign} onCancel={() => setShowResignModal(false)}
        confirmLabel="Resign" cancelLabel="Cancel" confirmClass="btn-danger" />
      <Modal show={showDrawModal} title="Offer Draw?" message="Send a draw offer to your opponent?"
        onConfirm={confirmOfferDraw} onCancel={() => setShowDrawModal(false)}
        confirmLabel="Send Offer" cancelLabel="Cancel" confirmClass="btn-primary" />
      <Modal show={!!rematchOffer} title="Rematch?" message={`${rematchOffer} wants a rematch!`}
        onConfirm={handleAcceptRematch} onCancel={handleDeclineRematch}
        confirmLabel="Accept" cancelLabel="Decline" confirmClass="btn-primary" />

      <div className="game-layout">
        <div className="game-board-col">

          <PlayerBar player={opponent} color={topColor}
            isActive={game.turn === topColor && !isGameOver}
            time={topTime} isLowTime={topLow} isMe={false}
            avatar={oppAvatar} country={oppCountry} />

          <div style={{ position: 'relative' }}>
            <Board board={game.board} myColor={myColor} turn={game.turn}
              legalMoves={game.legalMoves || []} onMove={handleMove}
              gameOver={isGameOver} lastMove={lastMove} />

            {drawOffer && !isGameOver && (
              <div className="draw-offer-banner">
                <span>🤝 {drawOffer} offers a draw</span>
                <button className="btn btn-sm btn-primary" onClick={handleAcceptDraw}>Accept</button>
                <button className="btn btn-sm btn-secondary" onClick={handleDeclineDraw}>Decline</button>
              </div>
            )}

            {isGameOver && resultData && (
              <div className="game-over-overlay">
                <div className="game-over-box">
                  <div className="game-over-emoji">{resultEmoji}</div>
                  <h2>{resultText}</h2>
                  <div className="game-over-subtitle">Game over</div>
                  <div className={`elo-change ${eloChangeClass}`}>{eloChangeText} ELO</div>
                  <div className="game-over-actions">
                    {rematchDeclined ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Rematch declined.</p>
                    ) : rematchPending ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Waiting for rematch...</p>
                    ) : (
                      <button className="btn btn-primary" onClick={handleRequestRematch}>🔄 Rematch</button>
                    )}
                    <button className="btn btn-secondary" onClick={() => navigate('/')}>🏠 Home</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <PlayerBar player={me} color={bottomColor}
            isActive={game.turn === bottomColor && !isGameOver}
            time={bottomTime} isLowTime={bottomLow} isMe={true}
            avatar={myAvatar} country={myCountry} />
        </div>

        <div className="game-sidebar">
          {!isGameOver && (
            <div className="sidebar-section">
              <div className="game-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setShowDrawModal(true)}>🤝 Offer Draw</button>
                <button className="btn btn-danger btn-sm" onClick={() => setShowResignModal(true)}>⚑ Resign</button>
              </div>
            </div>
          )}

          <div className="sidebar-section">
            <div className="sidebar-header"><span className="sidebar-header-icon">📋</span> Moves</div>
            <div className="sidebar-body" style={{ padding: '6px 4px' }}>
              <div className="move-list">
                {movePairs.length > 0 ? movePairs.map(({ num, red, black }) => (
                  <div key={num} className="move-row">
                    <span className="move-num">{num}.</span>
                    <span className="move-cell">{red ? moveToString(red) : ''}</span>
                    <span className="move-cell">{black ? moveToString(black) : ''}</span>
                  </div>
                )) : <div className="no-moves">No moves yet</div>}
              </div>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-header"><span className="sidebar-header-icon">💬</span> Chat</div>
            <div className="sidebar-body">
              <div className="chat-messages">
                {chatMessages.map((msg, i) => (
                  <div key={i} className="chat-msg">
                    <span className="chat-msg-user">{msg.from}: </span>
                    <span className="chat-msg-text">{msg.message}</span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="chat-input-row">
                <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleChat(e)} placeholder="Type a message..." />
                <button className="btn btn-sm btn-secondary" onClick={handleChat}>Send</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}