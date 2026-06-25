import { useState, useMemo, useEffect, useRef, useCallback } from 'react';

const EMPTY = 0, RED = 1, RED_KING = 2, BLACK = 3, BLACK_KING = 4;

function isRed(p) { return p === RED || p === RED_KING; }
function isBlack(p) { return p === BLACK || p === BLACK_KING; }
function isKing(p) { return p === RED_KING || p === BLACK_KING; }
function pieceColor(p) { return isRed(p) ? 'red' : isBlack(p) ? 'black' : null; }

export default function Board({ board, myColor, turn, legalMoves, onMove, gameOver, lastMove }) {
  const [selected, setSelected] = useState(null);
  const [animating, setAnimating] = useState(false);
  const [animState, setAnimState] = useState(null);
  const [hiddenSquare, setHiddenSquare] = useState(null);
  const [phantomCaptures, setPhantomCaptures] = useState([]);

  // Drag state — use refs to avoid stale closures in event listeners
  const dragPieceRef = useRef(null);
  const dragStartPos = useRef(null);
  const [dragPiece, setDragPiece] = useState(null);
  const [dragPos, setDragPos] = useState(null);
  const [hoveredSquare, setHoveredSquare] = useState(null);

  const boardRef = useRef(null);
  const animTimers = useRef([]);
  const squareSizeRef = useRef(72);

  const shouldFlip = myColor === 'black';
  const isMyTurn = myColor === turn && !gameOver;

  const clearTimers = useCallback(() => {
    animTimers.current.forEach(t => clearTimeout(t));
    animTimers.current = [];
  }, []);

  // Update square size when board renders
  useEffect(() => {
    if (boardRef.current) {
      squareSizeRef.current = boardRef.current.getBoundingClientRect().width / 8;
    }
  });

  useEffect(() => {
    if (!lastMove || !lastMove.path || lastMove.path.length < 2) return;
    clearTimers();
    setAnimating(true);

    const path = lastMove.path;
    const captures = lastMove.captures || [];
    const finalPos = path[path.length - 1];
    const movedPiece = board[finalPos[0]][finalPos[1]];
    const capColor = isRed(movedPiece) ? 'black' : 'red';

    setHiddenSquare(`${finalPos[0]},${finalPos[1]}`);
    setPhantomCaptures(captures.map(([r, c]) => ({ row: r, col: c, color: capColor, visible: true })));
    setAnimState({ pieceType: movedPiece, row: path[0][0], col: path[0][1], moving: false });

    let step = 0;
    function doStep() {
      step++;
      if (step >= path.length) {
        setAnimState(null); setHiddenSquare(null); setPhantomCaptures([]);
        setAnimating(false); return;
      }
      setAnimState({ pieceType: movedPiece, row: path[step][0], col: path[step][1], moving: true });
      if (step - 1 < captures.length) {
        const ci = step - 1;
        setPhantomCaptures(prev => prev.map((p, i) => i === ci ? { ...p, visible: false } : p));
      }
      animTimers.current.push(setTimeout(doStep, 210));
    }
    requestAnimationFrame(() => requestAnimationFrame(() => doStep()));
    return clearTimers;
  }, [lastMove]);

  const movesForSelected = useMemo(() => {
    if (!selected) return [];
    return legalMoves.filter(m => m.from[0] === selected[0] && m.from[1] === selected[1]);
  }, [selected, legalMoves]);

  const moveTargets = useMemo(() => {
    const set = new Set();
    movesForSelected.forEach(m => set.add(`${m.to[0]},${m.to[1]}`));
    return set;
  }, [movesForSelected]);

  const movablePieces = useMemo(() => {
    const set = new Set();
    legalMoves.forEach(m => set.add(`${m.from[0]},${m.from[1]}`));
    return set;
  }, [legalMoves]);

  const dragTargets = useMemo(() => {
    if (!dragPiece) return new Set();
    const set = new Set();
    legalMoves.filter(m => m.from[0] === dragPiece[0] && m.from[1] === dragPiece[1])
      .forEach(m => set.add(`${m.to[0]},${m.to[1]}`));
    return set;
  }, [dragPiece, legalMoves]);

  function handleSquareClick(r, c) {
    if (!isMyTurn || dragPiece || animating) return;
    const piece = board[r][c];
    if (selected && moveTargets.has(`${r},${c}`)) {
      onMove(selected, [r, c]); setSelected(null); return;
    }
    if (piece !== EMPTY && pieceColor(piece) === myColor && movablePieces.has(`${r},${c}`)) {
      setSelected([r, c]); return;
    }
    setSelected(null);
  }

  function getBoardCoords(clientX, clientY) {
    if (!boardRef.current) return null;
    const rect = boardRef.current.getBoundingClientRect();
    const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
    const actualRow = shouldFlip ? 7 - row : row;
    const actualCol = shouldFlip ? 7 - col : col;
    if (actualRow < 0 || actualRow > 7 || actualCol < 0 || actualCol > 7) return null;
    return [actualRow, actualCol];
  }

  function handlePiecePointerDown(e, r, c) {
    if (!isMyTurn || animating) return;
    const piece = board[r][c];
    if (piece === EMPTY || pieceColor(piece) !== myColor || !movablePieces.has(`${r},${c}`)) return;

    e.preventDefault();
    e.stopPropagation();

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    dragPieceRef.current = [r, c];
    dragStartPos.current = { x: clientX, y: clientY };

    setDragPiece([r, c]);
    setDragPos({ x: clientX, y: clientY });
    setSelected([r, c]);
  }

  useEffect(() => {
    if (!dragPiece) return;

    function onPointerMove(e) {
      e.preventDefault();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      setDragPos({ x: clientX, y: clientY });
      const coords = getBoardCoords(clientX, clientY);
      setHoveredSquare(coords ? `${coords[0]},${coords[1]}` : null);
    }

    function onPointerUp(e) {
      const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
      const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
      const coords = getBoardCoords(clientX, clientY);
      const dp = dragPieceRef.current;

      if (coords && dp && dragTargets.has(`${coords[0]},${coords[1]}`)) {
        onMove(dp, coords);
        setSelected(null);
      }

      dragPieceRef.current = null;
      dragStartPos.current = null;
      setDragPiece(null);
      setDragPos(null);
      setHoveredSquare(null);
    }

    window.addEventListener('mousemove', onPointerMove, { passive: false });
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', onPointerUp);
    return () => {
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
    };
  }, [dragPiece, dragTargets]);

  function getDisplayCoords(row, col) {
    return shouldFlip ? [7 - row, 7 - col] : [row, col];
  }

  function renderPiece(piece, cls = '', style = {}) {
    const color = pieceColor(piece);
    const king = isKing(piece);
    return (
      <div className={`piece ${color}-piece${king ? ' king' : ''}${cls ? ' ' + cls : ''}`} style={style}>
        <div className="piece-shine" />
        <div className="piece-inner">
          {king && <span className="piece-crown">♛</span>}
        </div>
      </div>
    );
  }

  function renderSquare(gr, gc) {
    const ar = shouldFlip ? 7 - gr : gr;
    const ac = shouldFlip ? 7 - gc : gc;
    const isDark = (ar + ac) % 2 === 0;
    const piece = board[ar][ac];
    const isSelected = selected && selected[0] === ar && selected[1] === ac;
    const isDragSrc = dragPiece && dragPiece[0] === ar && dragPiece[1] === ac;
    const targets = dragPiece ? dragTargets : moveTargets;
    const isMoveTarget = targets.has(`${ar},${ac}`);
    const isHovered = hoveredSquare === `${ar},${ac}` && dragPiece;
    const isCapture = isMoveTarget && legalMoves.some(m => m.to[0] === ar && m.to[1] === ac && m.captures.length > 0);
    const isHidden = hiddenSquare === `${ar},${ac}`;
    const isLastMove = lastMove && (
      (lastMove.from[0] === ar && lastMove.from[1] === ac) ||
      (lastMove.to[0] === ar && lastMove.to[1] === ac)
    );

    let sqClass = `board-square ${isDark ? 'dark' : 'light'}`;
    if (isLastMove) sqClass += ' last-move';
    if (isSelected || isDragSrc) sqClass += ' highlighted';
    if (isHovered && isMoveTarget) sqClass += ' drop-hover';
    if (isMoveTarget && isMyTurn) sqClass += isCapture ? ' can-capture' : ' can-move';

    let pieceEl = null;
    if (piece !== EMPTY && !isHidden && !isDragSrc) {
      const canMove = isMyTurn && pieceColor(piece) === myColor && movablePieces.has(`${ar},${ac}`);
      pieceEl = (
        <div
          className="piece-wrapper"
          onMouseDown={e => handlePiecePointerDown(e, ar, ac)}
          onTouchStart={e => handlePiecePointerDown(e, ar, ac)}
        >
          {renderPiece(piece, !canMove ? 'not-turn' : isSelected ? 'selected' : '')}
        </div>
      );
    }

    return (
      <div key={`${gr}-${gc}`} className={sqClass} onClick={() => handleSquareClick(ar, ac)}>
        {isDark && gr === 7 && <span className="coord-letter">{String.fromCharCode(97 + (shouldFlip ? 7 - gc : gc))}</span>}
        {isDark && gc === 0 && <span className="coord-number">{shouldFlip ? gr + 1 : 8 - gr}</span>}
        {pieceEl}
        {isMoveTarget && isMyTurn && !isCapture && <div className="move-dot" />}
        {isMoveTarget && isMyTurn && isCapture && <div className="capture-ring" />}
      </div>
    );
  }

  const squares = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) squares.push(renderSquare(r, c));

  const sqSize = squareSizeRef.current;

  return (
    <>
      <div className="board-outer">
        <div className="board-container" ref={boardRef}>
          <div className="board-grid">{squares}</div>

          {/* Move animation overlay */}
          {animState && (() => {
            const [dr, dc] = getDisplayCoords(animState.row, animState.col);
            return (
              <div
                className="anim-piece-wrapper"
                style={{
                  left: `${dc * 12.5}%`,
                  top: `${dr * 12.5}%`,
                  transition: animState.moving
                    ? 'left 0.18s cubic-bezier(.4,0,.2,1), top 0.18s cubic-bezier(.4,0,.2,1)'
                    : 'none'
                }}
              >
                {renderPiece(animState.pieceType)}
              </div>
            );
          })()}

          {/* Phantom captured pieces */}
          {phantomCaptures.map((cap, i) => {
            const [dr, dc] = getDisplayCoords(cap.row, cap.col);
            const pType = cap.color === 'red' ? RED : BLACK;
            return (
              <div
                key={`ph-${i}`}
                className={`anim-piece-wrapper${!cap.visible ? ' capture-fade' : ''}`}
                style={{ left: `${dc * 12.5}%`, top: `${dr * 12.5}%` }}
              >
                {renderPiece(pType)}
              </div>
            );
          })}
        </div>
      </div>

      {/* Drag floater — rendered outside board so it's never clipped */}
      {dragPiece && dragPos && (() => {
        const piece = board[dragPiece[0]][dragPiece[1]];
        if (!piece) return null;
        return (
          <div
            style={{
              position: 'fixed',
              left: dragPos.x - sqSize * 0.5,
              top: dragPos.y - sqSize * 0.5,
              width: sqSize,
              height: sqSize,
              zIndex: 9999,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: 'scale(1.12)',
              filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.65))',
            }}
          >
            <div style={{ width: '88%', height: '88%' }}>
              {renderPiece(piece, '', { cursor: 'grabbing', transform: 'none', transition: 'none' })}
            </div>
          </div>
        );
      })()}
    </>
  );
}