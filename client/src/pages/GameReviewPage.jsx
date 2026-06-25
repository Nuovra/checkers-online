import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// ── Piece constants ───────────────────────────────────────────────────────────
const EMPTY = 0, RED = 1, RED_KING = 2, BLACK = 3, BLACK_KING = 4;
function isRed(p)      { return p === RED   || p === RED_KING;   }
function isBlack(p)    { return p === BLACK || p === BLACK_KING; }
function isKing(p)     { return p === RED_KING || p === BLACK_KING; }
function pieceColor(p) { return isRed(p) ? 'red' : isBlack(p) ? 'black' : null; }

function toNotation(row, col) {
  return `${'abcdefgh'[col]}${8 - row}`;
}
function moveToStr(move) {
  if (!move) return '';
  const from = toNotation(move.from[0], move.from[1]);
  const to   = toNotation(move.to[0],   move.to[1]);
  return move.captures?.length > 0 ? `${from}×${to}` : `${from}-${to}`;
}

// ── Board component ───────────────────────────────────────────────────────────
function ReviewBoard({ board, lastMove, flipped }) {
  const squares = [];
  for (let gr = 0; gr < 8; gr++) {
    for (let gc = 0; gc < 8; gc++) {
      const ar = flipped ? 7 - gr : gr;
      const ac = flipped ? 7 - gc : gc;
      const isDark = (ar + ac) % 2 === 0;
      const piece  = board[ar][ac];

      const isFrom = lastMove && lastMove.from[0] === ar && lastMove.from[1] === ac;
      const isTo   = lastMove && lastMove.to[0]   === ar && lastMove.to[1]   === ac;
      const isCap  = lastMove && (lastMove.captures || []).some(([r, c]) => r === ar && c === ac);

      let cls = `board-square ${isDark ? 'dark' : 'light'}`;
      if (isFrom || isTo) cls += ' last-move';
      if (isCap)          cls += ' review-capture';

      squares.push(
        <div key={`${gr}-${gc}`} className={cls}>
          {isDark && gr === 7 && (
            <span className="coord-letter">{String.fromCharCode(97 + (flipped ? 7 - gc : gc))}</span>
          )}
          {isDark && gc === 0 && (
            <span className="coord-number">{flipped ? gr + 1 : 8 - gr}</span>
          )}
          {piece !== EMPTY && (
            <div className="piece-wrapper" style={{ pointerEvents: 'none' }}>
              <div className={`piece ${pieceColor(piece)}-piece${isKing(piece) ? ' king' : ''}`}
                style={{ cursor: 'default' }}>
                <div className="piece-shine" />
                <div className="piece-inner">
                  {isKing(piece) && <span className="piece-crown">♛</span>}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }
  }

  return (
    <div className="board-outer">
      <div className="board-container" style={{
        width:  'min(560px, calc(100vh - 220px), calc(100vw - 340px))',
        height: 'min(560px, calc(100vh - 220px), calc(100vw - 340px))',
      }}>
        <div className="board-grid">{squares}</div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function GameReviewPage() {
  const { gameId } = useParams();
  const { token }  = useAuth();
  const navigate   = useNavigate();

  const [gameData,  setGameData]  = useState(null);
  const [movesData, setMovesData] = useState(null);
  const [step,      setStep]      = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [flipped,   setFlipped]   = useState(false);
  const [autoPlay,  setAutoPlay]  = useState(false);

  useEffect(() => {
    if (!gameId) return;
    setLoading(true); setError(null);

    fetch(`/api/auth/game/${gameId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setGameData(data.game);
        setMovesData(data.movesData || null);
        setStep(0);
      })
      .catch(err => {
        console.error('Review fetch error:', err);
        setError('Failed to load game data');
      })
      .finally(() => setLoading(false));
  }, [gameId, token]);

  // Auto-play
  useEffect(() => {
    if (!autoPlay || !movesData) return;
    const total = movesData.moves?.length || 0;
    if (step >= total) { setAutoPlay(false); return; }
    const t = setTimeout(() => setStep(s => s + 1), 800);
    return () => clearTimeout(t);
  }, [autoPlay, step, movesData]);

  // Keyboard
  useEffect(() => {
    function onKey(e) {
      if (!movesData) return;
      const total = movesData.moves?.length || 0;
      if (e.key === 'ArrowLeft')  { setAutoPlay(false); setStep(s => Math.max(0, s - 1)); }
      if (e.key === 'ArrowRight') { setAutoPlay(false); setStep(s => Math.min(total, s + 1)); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [movesData]);

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading) return (
    <div className="page" style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      <div className="queue-spinner" />
      <p style={{ color: 'var(--text-muted)' }}>Loading game review...</p>
    </div>
  );

  if (error) return (
    <div className="page" style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      <div style={{ fontSize: 48 }}>❌</div>
      <p style={{ color: 'var(--red-col)', fontSize: 15 }}>{error}</p>
      <button className="btn btn-secondary" onClick={() => navigate(-1)}>← Go Back</button>
    </div>
  );

  if (!gameData) return (
    <div className="page" style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      <p style={{ color: 'var(--text-muted)' }}>Game not found.</p>
      <button className="btn btn-secondary" onClick={() => navigate(-1)}>← Go Back</button>
    </div>
  );

  // ── Derived values ─────────────────────────────────────────────────────────
  const hasReplay  = !!(movesData?.boardHistory?.length > 1 && movesData?.moves?.length > 0);
  const totalMoves = hasReplay ? movesData.moves.length : 0;
  const safeStep   = Math.min(step, hasReplay ? movesData.boardHistory.length - 1 : 0);
  const board      = hasReplay ? movesData.boardHistory[safeStep] : null;
  const lastMove   = hasReplay && safeStep > 0 ? movesData.moves[safeStep - 1] : null;
  const pct        = totalMoves > 0 ? (safeStep / totalMoves) * 100 : 0;

  const redName   = gameData.red_username   || 'Red';
  const blackName = gameData.black_username || 'Black';

  const topName       = flipped ? redName   : blackName;
  const topColor      = flipped ? 'red'     : 'black';
  const topEloBefore  = flipped ? gameData.red_elo_before   : gameData.black_elo_before;
  const bottomName    = flipped ? blackName : redName;
  const bottomColor   = flipped ? 'black'   : 'red';
  const bottomEloBefore = flipped ? gameData.black_elo_before : gameData.red_elo_before;

  let resultLabel = 'Game Over';
  if      (gameData.result === 'red_win')   resultLabel = `${redName} won`;
  else if (gameData.result === 'black_win') resultLabel = `${blackName} won`;
  else if (gameData.result === 'draw')      resultLabel = 'Draw';
  else if (gameData.result === 'abandoned') resultLabel = 'Abandoned';

  // Group moves in pairs like chess.com
  const movePairs = [];
  if (hasReplay) {
    for (let i = 0; i < movesData.moves.length; i += 2) {
      movePairs.push({
        num:      Math.floor(i / 2) + 1,
        red:      movesData.moves[i],
        black:    movesData.moves[i + 1] || null,
        redIdx:   i + 1,
        blackIdx: i + 2,
      });
    }
  }

  function goTo(idx) {
    setAutoPlay(false);
    setStep(Math.max(0, Math.min(totalMoves, idx)));
  }

  return (
    <div className="page game-page">
      <div className="game-layout">

        {/* ── Board column ──────────────────────────────────────────── */}
        <div className="game-board-col">

          {/* Top player */}
          <div className="player-bar">
            <div className="player-bar-left">
              <div className="player-bar-avatar">{topName[0]?.toUpperCase()}</div>
              <div className="player-bar-info">
                <div className="player-bar-name">
                  <span className={`color-dot ${topColor}`} />
                  {topName}
                </div>
                <div className="player-bar-rating">{topEloBefore} ELO</div>
              </div>
            </div>
          </div>

          {/* Board */}
          {hasReplay ? (
            <ReviewBoard board={board} lastMove={lastMove} flipped={flipped} />
          ) : (
            <div className="board-outer">
              <div style={{
                width: 'min(560px, calc(100vw - 340px))',
                height: 'min(560px, calc(100vw - 340px))',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-card)', borderRadius: 4,
                color: 'var(--text-muted)', textAlign: 'center', gap: 12, padding: 40,
              }}>
                <div style={{ fontSize: 52 }}>📭</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>No replay available</div>
                <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                  This game was played before move recording was enabled.<br />
                  Future games will have full replay support.
                </div>
              </div>
            </div>
          )}

          {/* Bottom player */}
          <div className="player-bar">
            <div className="player-bar-left">
              <div className="player-bar-avatar">{bottomName[0]?.toUpperCase()}</div>
              <div className="player-bar-info">
                <div className="player-bar-name">
                  <span className={`color-dot ${bottomColor}`} />
                  {bottomName}
                </div>
                <div className="player-bar-rating">{bottomEloBefore} ELO</div>
              </div>
            </div>
          </div>

          {/* ── Controls ── */}
          {hasReplay && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" title="Start (Home)" onClick={() => goTo(0)}>⏮</button>
                <button
                  className="btn btn-secondary"
                  style={{ minWidth: 52, fontSize: 20 }}
                  title="Previous move (←)"
                  onClick={() => goTo(safeStep - 1)}
                  disabled={safeStep === 0}
                >◀</button>
                <button
                  className="btn btn-primary"
                  style={{ minWidth: 80 }}
                  onClick={() => { if (safeStep >= totalMoves) setStep(0); setAutoPlay(a => !a); }}
                >
                  {autoPlay ? '⏸ Pause' : '▶ Play'}
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ minWidth: 52, fontSize: 20 }}
                  title="Next move (→)"
                  onClick={() => goTo(safeStep + 1)}
                  disabled={safeStep >= totalMoves}
                >▶</button>
                <button className="btn btn-ghost btn-sm" title="End" onClick={() => goTo(totalMoves)}>⏭</button>
                <button className="btn btn-ghost btn-sm" title="Flip board" onClick={() => setFlipped(f => !f)}>⇅</button>
              </div>

              {/* Progress bar — clickable */}
              <div>
                <div
                  style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', cursor: 'pointer' }}
                  onClick={e => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    goTo(Math.round(((e.clientX - rect.left) / rect.width) * totalMoves));
                  }}
                >
                  <div style={{
                    height: '100%', width: `${pct}%`, borderRadius: 3,
                    background: 'linear-gradient(90deg, var(--accent-dark), var(--accent))',
                    transition: 'width 0.1s',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11, color: 'var(--text-muted)' }}>
                  <span>Move {safeStep} / {totalMoves}</span>
                  <span>← → keys also work</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Sidebar ──────────────────────────────────────────────── */}
        <div className="game-sidebar">

          {/* Result card */}
          <div className="sidebar-section">
            <div className="sidebar-header"><span className="sidebar-header-icon">🏁</span> Result</div>
            <div className="sidebar-body" style={{ textAlign: 'center', padding: '16px 12px' }}>
              <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>
                {gameData.result === 'draw' ? '🤝' : '🏆'} {resultLabel}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                {gameData.moves_count} moves
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
                {[
                  { name: redName,   before: gameData.red_elo_before,   after: gameData.red_elo_after   },
                  { name: blackName, before: gameData.black_elo_before, after: gameData.black_elo_after },
                ].map(p => {
                  const after  = p.after || p.before;
                  const change = after - p.before;
                  return (
                    <div key={p.name}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{p.name}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, color: 'var(--gold)' }}>
                        {p.before} → {after}
                      </div>
                      <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700, marginTop: 2, color: change >= 0 ? 'var(--green)' : 'var(--red-col)' }}>
                        {change > 0 ? '+' : ''}{change}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Move list like chess.com */}
          <div className="sidebar-section" style={{ flex: 1 }}>
            <div className="sidebar-header"><span className="sidebar-header-icon">📋</span> Moves</div>
            <div className="sidebar-body" style={{ padding: '6px 4px' }}>
              {!hasReplay ? (
                <div className="no-moves">No move data available</div>
              ) : (
                <div className="move-list" style={{ maxHeight: 400 }}>
                  {movePairs.map(({ num, red, black, redIdx, blackIdx }) => (
                    <div key={num} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr', borderRadius: 4 }}
                      className="move-row">
                      <span className="move-num">{num}.</span>
                      {/* Red move */}
                      <span
                        onClick={() => red && goTo(redIdx)}
                        style={{
                          fontFamily: 'var(--font-mono)', fontSize: 13, padding: '5px 6px',
                          cursor: 'pointer', borderRadius: 3, display: 'block',
                          background: safeStep === redIdx ? 'rgba(129,182,76,0.2)' : 'transparent',
                          color: safeStep === redIdx ? 'var(--accent)' : 'var(--text-secondary)',
                          fontWeight: safeStep === redIdx ? 700 : 400,
                        }}
                      >
                        {red ? moveToStr(red) : ''}
                      </span>
                      {/* Black move */}
                      <span
                        onClick={() => black && goTo(blackIdx)}
                        style={{
                          fontFamily: 'var(--font-mono)', fontSize: 13, padding: '5px 6px',
                          cursor: black ? 'pointer' : 'default', borderRadius: 3, display: 'block',
                          background: safeStep === blackIdx ? 'rgba(129,182,76,0.2)' : 'transparent',
                          color: safeStep === blackIdx ? 'var(--accent)' : 'var(--text-secondary)',
                          fontWeight: safeStep === blackIdx ? 700 : 400,
                        }}
                      >
                        {black ? moveToStr(black) : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => navigate(-1)}>
            ← Back to Profile
          </button>
        </div>
      </div>
    </div>
  );
}