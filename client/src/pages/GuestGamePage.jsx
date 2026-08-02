import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// ── Inline checkers engine ────────────────────────────────────────────────────
const EMPTY = 0, RED = 1, RED_KING = 2, BLACK = 3, BLACK_KING = 4;
function isRed(p)      { return p === RED   || p === RED_KING;   }
function isBlack(p)    { return p === BLACK || p === BLACK_KING; }
function isKing(p)     { return p === RED_KING || p === BLACK_KING; }
function ownerColor(p) { return isRed(p) ? 'red' : isBlack(p) ? 'black' : null; }
function inBounds(r,c) { return r>=0&&r<8&&c>=0&&c<8; }
function cloneBoard(b) { return b.map(r=>[...r]); }

function getDirs(piece) {
  const d=[];
  if(piece===RED||piece===RED_KING||piece===BLACK_KING) d.push([-1,-1],[-1,1]);
  if(piece===BLACK||piece===BLACK_KING||piece===RED_KING) d.push([1,-1],[1,1]);
  return d;
}

function createBoard() {
  const b=Array.from({length:8},()=>Array(8).fill(EMPTY));
  for(let r=0;r<3;r++) for(let c=0;c<8;c++) if((r+c)%2===0) b[r][c]=BLACK;
  for(let r=5;r<8;r++) for(let c=0;c<8;c++) if((r+c)%2===0) b[r][c]=RED;
  return b;
}

function getCaptures(board,r,c,color,king) {
  const seqs=[];
  const orig=board[r][c];
  function dfs(b,cr,cc,path,caps,crowned) {
    const dirs=crowned||king?[[-1,-1],[-1,1],[1,-1],[1,1]]:getDirs(orig);
    let found=false;
    for(const [dr,dc] of dirs) {
      const mr=cr+dr,mc=cc+dc,lr=cr+2*dr,lc=cc+2*dc;
      if(!inBounds(mr,mc)||!inBounds(lr,lc)) continue;
      const mp=b[mr][mc];
      if(!mp||ownerColor(mp)===color) continue;
      if(b[lr][lc]!==EMPTY) continue;
      if(caps.some(([x,y])=>x===mr&&y===mc)) continue;
      found=true;
      const nb=cloneBoard(b);
      nb[lr][lc]=nb[cr][cc]; nb[cr][cc]=EMPTY; nb[mr][mc]=EMPTY;
      const justCrown=!crowned&&!king&&((color==='red'&&lr===0)||(color==='black'&&lr===7));
      if(justCrown) nb[lr][lc]=color==='red'?RED_KING:BLACK_KING;
      dfs(nb,lr,lc,[...path,[lr,lc]],[...caps,[mr,mc]],justCrown);
    }
    if(!found&&caps.length>0) seqs.push({from:[r,c],to:[cr,cc],captures:[...caps],path:[...path]});
  }
  dfs(board,r,c,[[r,c]],[],false);
  return seqs;
}

function getSimple(board,r,c) {
  const p=board[r][c]; if(!p) return [];
  const moves=[];
  for(const [dr,dc] of getDirs(p)) {
    const nr=r+dr,nc=c+dc;
    if(inBounds(nr,nc)&&board[nr][nc]===EMPTY)
      moves.push({from:[r,c],to:[nr,nc],captures:[],path:[[r,c],[nr,nc]]});
  }
  return moves;
}

function getLegalMoves(board,color) {
  let caps=[],simples=[];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    const p=board[r][c];
    if(!p||ownerColor(p)!==color) continue;
    const c2=getCaptures(board,r,c,color,isKing(p));
    if(c2.length) caps.push(...c2);
    else simples.push(...getSimple(board,r,c));
  }
  if(caps.length) { const m=Math.max(...caps.map(x=>x.captures.length)); return caps.filter(x=>x.captures.length===m); }
  return simples;
}

function applyMove(board,move) {
  const nb=cloneBoard(board);
  const p=nb[move.from[0]][move.from[1]];
  const color=ownerColor(p);
  nb[move.from[0]][move.from[1]]=EMPTY;
  for(const [r,c] of move.captures) nb[r][c]=EMPTY;
  let fp=p;
  if(!isKing(p)) {
    if((color==='red'&&move.to[0]===0)||(color==='black'&&move.to[0]===7))
      fp=color==='red'?RED_KING:BLACK_KING;
  }
  nb[move.to[0]][move.to[1]]=fp;
  return nb;
}

function getResult(board,turn) {
  if(!getLegalMoves(board,turn).length) return turn==='red'?'black_win':'red_win';
  let r=0,bl=0;
  for(let i=0;i<8;i++) for(let j=0;j<8;j++) {
    if(isRed(board[i][j])) r++;
    if(isBlack(board[i][j])) bl++;
  }
  if(r===0) return 'black_win';
  if(bl===0) return 'red_win';
  return null;
}

function countPieces(board,color) {
  let n=0;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    const p=board[r][c];
    if(ownerColor(p)===color) n+=(isKing(p)?2.5:1);
  }
  return n;
}

function minimax(board,turn,depth,alpha,beta,maxing,botColor) {
  const res=getResult(board,turn);
  if(res) return res===`${botColor}_win`?1000+depth:-1000-depth;
  if(depth===0) return countPieces(board,botColor)-countPieces(board,botColor==='red'?'black':'red');
  const moves=getLegalMoves(board,turn);
  const next=turn==='red'?'black':'red';
  if(maxing) {
    let best=-Infinity;
    for(const m of moves){ const v=minimax(applyMove(board,m),next,depth-1,alpha,beta,false,botColor); best=Math.max(best,v); alpha=Math.max(alpha,v); if(beta<=alpha) break; }
    return best;
  } else {
    let best=Infinity;
    for(const m of moves){ const v=minimax(applyMove(board,m),next,depth-1,alpha,beta,true,botColor); best=Math.min(best,v); beta=Math.min(beta,v); if(beta<=alpha) break; }
    return best;
  }
}

function getBotMove(board,botColor) {
  const moves=getLegalMoves(board,botColor);
  if(!moves.length) return null;
  if(Math.random()<0.15) return moves[Math.floor(Math.random()*moves.length)];
  let bestVal=-Infinity,bestMoves=[];
  const next=botColor==='red'?'black':'red';
  for(const m of moves){
    const v=minimax(applyMove(board,m),next,3,-Infinity,Infinity,false,botColor);
    if(v>bestVal){bestVal=v;bestMoves=[m];}
    else if(v===bestVal) bestMoves.push(m);
  }
  return bestMoves[Math.floor(Math.random()*bestMoves.length)];
}

// ── Board component ───────────────────────────────────────────────────────────
function GuestBoard({ board, selected, legalMoves, onSquareClick, lastMove }) {
  const squares = [];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    const isDark=(r+c)%2===0;
    const piece=board[r][c];
    const isSelected=selected&&selected[0]===r&&selected[1]===c;
    const isLegalDest=legalMoves.some(m=>m.to[0]===r&&m.to[1]===c);
    const isLegalSrc=legalMoves.some(m=>m.from[0]===r&&m.from[1]===c);
    const isFrom=lastMove&&lastMove.from[0]===r&&lastMove.from[1]===c;
    const isTo=lastMove&&lastMove.to[0]===r&&lastMove.to[1]===c;
    let cls=`board-square ${isDark?'dark':'light'}`;
    if(isSelected) cls+=' selected';
    if(isFrom||isTo) cls+=' last-move';
    squares.push(
      <div key={`${r}-${c}`} className={cls} onClick={() => isDark && onSquareClick(r,c)}>
        {isDark && isLegalDest && !piece && <div className="legal-dot" />}
        {isDark && r===7 && <span className="coord-letter">{String.fromCharCode(97+c)}</span>}
        {isDark && c===0 && <span className="coord-number">{8-r}</span>}
        {piece!==EMPTY && (
          <div className="piece-wrapper">
            <div className={`piece ${ownerColor(piece)}-piece${isKing(piece)?' king':''}`}
              style={{cursor: ownerColor(piece)==='red'&&!isSelected?'pointer':'default'}}>
              <div className="piece-shine"/>
              <div className="piece-inner">
                {isKing(piece)&&<span className="piece-crown">♛</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="board-outer">
      <div className="board-container" style={{ width:'min(520px,calc(100vw - 32px))', height:'min(520px,calc(100vw - 32px))' }}>
        <div className="board-grid">{squares}</div>
      </div>
    </div>
  );
}

// ── Sign up modal ─────────────────────────────────────────────────────────────
function SignupModal({ show, moveCount, result, onSignup, onPlayAgain }) {
  if (!show) return null;
  const won = result === 'red_win';
  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }}>
      <div className="modal-box" style={{ maxWidth: 420, textAlign: 'center', padding: '36px 32px' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>{won ? '🏆' : '😤'}</div>
        <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>
          {won ? 'You Won!' : 'Game Over!'}
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
          You played <strong style={{ color: 'var(--accent)' }}>{moveCount} moves</strong> as a guest.
          Create a free account to save your stats, earn ELO, and challenge real players online!
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: 16, fontWeight: 800 }}
            onClick={onSignup}
          >
            🚀 Create Free Account
          </button>
          <button
            className="btn btn-ghost"
            style={{ width: '100%' }}
            onClick={onPlayAgain}
          >
            Play Again as Guest
          </button>
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 14 }}>
          Free forever · No credit card · Takes 30 seconds
        </p>
      </div>
    </div>
  );
}

// ── Main guest game page ──────────────────────────────────────────────────────
export default function GuestGamePage() {
  const navigate = useNavigate();
  const { user, loginAsGuest } = useAuth();

  const playerColor = 'red';
  const botColor    = 'black';

  const [board,     setBoard]     = useState(createBoard());
  const [turn,      setTurn]      = useState('red');
  const [selected,  setSelected]  = useState(null);
  const [legalMoves,setLegalMoves]= useState([]);
  const [result,    setResult]    = useState(null);
  const [lastMove,  setLastMove]  = useState(null);
  const [moveCount, setMoveCount] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [botThinking, setBotThinking] = useState(false);

  // Compute legal moves for current position
  const currentLegal = turn === playerColor && !result
    ? getLegalMoves(board, playerColor)
    : [];

  // Bot move effect
  useEffect(() => {
    if (turn !== botColor || result) return;
    setBotThinking(true);
    const t = setTimeout(() => {
      const move = getBotMove(board, botColor);
      if (!move) { setResult('red_win'); setBotThinking(false); return; }
      const newBoard = applyMove(board, move);
      setBoard(newBoard);
      setLastMove(move);
      const res = getResult(newBoard, playerColor);
      if (res) {
        setResult(res);
        setTimeout(() => setShowModal(true), 800);
      } else {
        setTurn(playerColor);
      }
      setBotThinking(false);
    }, 800 + Math.random() * 400);
    return () => clearTimeout(t);
  }, [turn, board, result]);

  function handleSquareClick(r, c) {
    if (turn !== playerColor || result || botThinking) return;
    const piece = board[r][c];

    // If a piece is already selected
    if (selected) {
      // Try to move to this square
      const move = currentLegal.find(m =>
        m.from[0]===selected[0] && m.from[1]===selected[1] &&
        m.to[0]===r && m.to[1]===c
      );
      if (move) {
        const newBoard = applyMove(board, move);
        setBoard(newBoard);
        setLastMove(move);
        setSelected(null);
        setLegalMoves([]);
        setMoveCount(prev => prev + 1);
        const res = getResult(newBoard, botColor);
        if (res) {
          setResult(res);
          setTimeout(() => setShowModal(true), 800);
        } else {
          setTurn(botColor);
        }
        return;
      }
      // Clicked same piece — deselect
      if (piece && ownerColor(piece) === playerColor) {
        setSelected([r, c]);
        setLegalMoves(currentLegal.filter(m => m.from[0]===r && m.from[1]===c));
        return;
      }
      setSelected(null);
      setLegalMoves([]);
      return;
    }

    // Select a piece
    if (piece && ownerColor(piece) === playerColor) {
      const moves = currentLegal.filter(m => m.from[0]===r && m.from[1]===c);
      if (moves.length > 0 || currentLegal.some(m => m.from[0]===r && m.from[1]===c)) {
        setSelected([r, c]);
        setLegalMoves(moves);
      }
    }
  }

  function resetGame() {
    setBoard(createBoard());
    setTurn('red');
    setSelected(null);
    setLegalMoves([]);
    setResult(null);
    setLastMove(null);
    setMoveCount(0);
    setShowModal(false);
    setBotThinking(false);
  }

  function handleSignup() {
    navigate('/login?signup=1');
  }

  return (
    <div className="page" style={{ alignItems: 'center', padding: '16px' }}>
      <SignupModal
        show={showModal}
        moveCount={moveCount}
        result={result}
        onSignup={handleSignup}
        onPlayAgain={resetGame}
      />

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', maxWidth: 560, marginBottom: 8,
      }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Playing as <strong style={{ color: 'var(--accent)' }}>Guest</strong>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSignup}
          style={{ fontSize: 12 }}
        >
          🚀 Create Account
        </button>
      </div>

      {/* Bot bar */}
      <div className="player-bar" style={{ width: '100%', maxWidth: 560, marginBottom: 4 }}>
        <div className="player-bar-left">
          <div className="player-bar-avatar" style={{ background: '#1a1a2e', fontSize: 18 }}>🤖</div>
          <div className="player-bar-info">
            <div className="player-bar-name"><span className="color-dot black" />Checkers Bot</div>
            <div className="player-bar-rating">{botThinking ? '💭 thinking...' : 'Medium difficulty'}</div>
          </div>
        </div>
      </div>

      {/* Board */}
      <GuestBoard
        board={board}
        selected={selected}
        legalMoves={selected ? legalMoves : currentLegal}
        onSquareClick={handleSquareClick}
        lastMove={lastMove}
      />

      {/* Player bar */}
      <div className="player-bar" style={{ width: '100%', maxWidth: 560, marginTop: 4 }}>
        <div className="player-bar-left">
          <div className="player-bar-avatar" style={{ background: 'var(--accent)', color: '#000', fontSize: 14, fontWeight: 900 }}>G</div>
          <div className="player-bar-info">
            <div className="player-bar-name"><span className="color-dot red" />You (Guest)</div>
            <div className="player-bar-rating">Playing as guest · no ELO tracked</div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{moveCount} moves</div>
      </div>

      {/* Game over inline */}
      {result && !showModal && (
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={handleSignup}>🚀 Create Account</button>
          <button className="btn btn-secondary" onClick={resetGame}>↺ Play Again</button>
        </div>
      )}

      {/* Sign up CTA banner at bottom */}
      <div style={{
        marginTop: 20, padding: '16px 24px', background: 'rgba(129,182,76,0.08)',
        border: '1px solid rgba(129,182,76,0.2)', borderRadius: 'var(--radius-lg)',
        textAlign: 'center', maxWidth: 560, width: '100%',
      }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>
          Want to play against real people?
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Create a free account to earn ELO, track your stats, and compete on the leaderboard.
        </div>
        <button className="btn btn-primary" onClick={handleSignup} style={{ padding: '10px 28px' }}>
          Sign Up Free — Takes 30 Seconds
        </button>
      </div>
    </div>
  );
}