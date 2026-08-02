import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

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
    for(const m of moves){const v=minimax(applyMove(board,m),next,depth-1,alpha,beta,false,botColor);best=Math.max(best,v);alpha=Math.max(alpha,v);if(beta<=alpha)break;}
    return best;
  } else {
    let best=Infinity;
    for(const m of moves){const v=minimax(applyMove(board,m),next,depth-1,alpha,beta,true,botColor);best=Math.min(best,v);beta=Math.min(beta,v);if(beta<=alpha)break;}
    return best;
  }
}

function getBotMove(board,botColor,difficulty='medium') {
  const moves=getLegalMoves(board,botColor);
  if(!moves.length) return null;
  const rand=()=>moves[Math.floor(Math.random()*moves.length)];
  if(difficulty==='easy') {
    if(Math.random()<0.7) return rand();
    const caps=moves.filter(m=>m.captures.length>0);
    return caps.length?caps[Math.floor(Math.random()*caps.length)]:rand();
  }
  const depth=difficulty==='hard'?6:3;
  if(difficulty==='medium'&&Math.random()<0.2) return rand();
  let bestVal=-Infinity,bestMoves=[];
  const next=botColor==='red'?'black':'red';
  for(const m of moves){
    const v=minimax(applyMove(board,m),next,depth,-Infinity,Infinity,false,botColor);
    if(v>bestVal){bestVal=v;bestMoves=[m];}
    else if(v===bestVal) bestMoves.push(m);
  }
  return bestMoves[Math.floor(Math.random()*bestMoves.length)];
}

function GuestBoard({ board, selected, legalMoves, onSquareClick, lastMove }) {
  const squares=[];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    const isDark=(r+c)%2===0;
    const piece=board[r][c];
    const isSelected=selected&&selected[0]===r&&selected[1]===c;
    const isLegalDest=legalMoves.some(m=>m.to[0]===r&&m.to[1]===c);
    const isFrom=lastMove&&lastMove.from[0]===r&&lastMove.from[1]===c;
    const isTo=lastMove&&lastMove.to[0]===r&&lastMove.to[1]===c;
    let cls=`board-square ${isDark?'dark':'light'}`;
    if(isSelected) cls+=' selected';
    if(isFrom||isTo) cls+=' last-move';
    squares.push(
      <div key={`${r}-${c}`} className={cls} onClick={()=>isDark&&onSquareClick(r,c)}>
        {isDark&&isLegalDest&&!piece&&<div className="legal-dot"/>}
        {isDark&&r===7&&<span className="coord-letter">{String.fromCharCode(97+c)}</span>}
        {isDark&&c===0&&<span className="coord-number">{8-r}</span>}
        {piece!==EMPTY&&(
          <div className="piece-wrapper">
            <div className={`piece ${ownerColor(piece)}-piece${isKing(piece)?' king':''}`}>
              <div className="piece-shine"/>
              <div className="piece-inner">{isKing(piece)&&<span className="piece-crown">♛</span>}</div>
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="board-outer">
      <div className="board-container" style={{width:'min(520px,calc(100vw - 32px))',height:'min(520px,calc(100vw - 32px))'}}>
        <div className="board-grid">{squares}</div>
      </div>
    </div>
  );
}

// ── Post-game signup prompt ───────────────────────────────────────────────────
function SignupPrompt({ show, result, moveCount, onSignup, onContinue }) {
  if (!show) return null;
  const won = result === 'red_win';
  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }}>
      <div className="modal-box" style={{ maxWidth: 400, textAlign: 'center', padding: '36px 28px' }}>
        <div style={{ fontSize: 52, marginBottom: 10 }}>{won ? '🏆' : '🎮'}</div>
        <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>
          {won ? 'You Won!' : 'Good Game!'}
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 6, lineHeight: 1.6 }}>
          You played <strong style={{ color: 'var(--accent)' }}>{moveCount} moves</strong> as a guest.
        </p>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
          Create a free account to <strong>save your stats</strong>, earn <strong>ELO ratings</strong>, and challenge <strong>real players online</strong>!
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: 16, fontWeight: 800 }}
            onClick={onSignup}
          >
            🚀 Yes, Create Free Account
          </button>
          <button
            className="btn btn-ghost"
            style={{ width: '100%', fontSize: 13 }}
            onClick={onContinue}
          >
            No thanks, continue as guest
          </button>
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
          Free forever · No credit card · 30 seconds to sign up
        </p>
      </div>
    </div>
  );
}

export default function GuestGamePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const difficulty = searchParams.get('difficulty') || 'medium';

  const playerColor = 'red';
  const botColor    = 'black';

  const [board,       setBoard]       = useState(createBoard());
  const [turn,        setTurn]        = useState('red');
  const [selected,    setSelected]    = useState(null);
  const [legalMoves,  setLegalMoves]  = useState([]);
  const [result,      setResult]      = useState(null);
  const [lastMove,    setLastMove]    = useState(null);
  const [moveCount,   setMoveCount]   = useState(0);
  const [showPrompt,  setShowPrompt]  = useState(false);
  const [botThinking, setBotThinking] = useState(false);

  const diffLabel = difficulty === 'easy' ? '🟢 Easy' : difficulty === 'medium' ? '🟡 Medium' : '🔴 Hard';

  const currentLegal = turn === playerColor && !result ? getLegalMoves(board, playerColor) : [];

  useEffect(() => {
    if (turn !== botColor || result) return;
    setBotThinking(true);
    const t = setTimeout(() => {
      const move = getBotMove(board, botColor, difficulty);
      if (!move) { setResult('red_win'); setBotThinking(false); setTimeout(() => setShowPrompt(true), 600); return; }
      const newBoard = applyMove(board, move);
      setBoard(newBoard);
      setLastMove(move);
      const res = getResult(newBoard, playerColor);
      if (res) { setResult(res); setTimeout(() => setShowPrompt(true), 600); }
      else setTurn(playerColor);
      setBotThinking(false);
    }, 800 + Math.random() * 400);
    return () => clearTimeout(t);
  }, [turn, board, result, difficulty]);

  function handleSquareClick(r, c) {
    if (turn !== playerColor || result || botThinking) return;
    const piece = board[r][c];
    if (selected) {
      const move = currentLegal.find(m =>
        m.from[0]===selected[0]&&m.from[1]===selected[1]&&m.to[0]===r&&m.to[1]===c
      );
      if (move) {
        const newBoard = applyMove(board, move);
        setBoard(newBoard); setLastMove(move); setSelected(null); setLegalMoves([]);
        setMoveCount(prev => prev + 1);
        const res = getResult(newBoard, botColor);
        if (res) { setResult(res); setTimeout(() => setShowPrompt(true), 600); }
        else setTurn(botColor);
        return;
      }
      if (piece && ownerColor(piece) === playerColor) {
        setSelected([r,c]);
        setLegalMoves(currentLegal.filter(m=>m.from[0]===r&&m.from[1]===c));
        return;
      }
      setSelected(null); setLegalMoves([]); return;
    }
    if (piece && ownerColor(piece) === playerColor) {
      const moves = currentLegal.filter(m=>m.from[0]===r&&m.from[1]===c);
      if (moves.length > 0) { setSelected([r,c]); setLegalMoves(moves); }
    }
  }

  function resetGame() {
    setBoard(createBoard()); setTurn('red'); setSelected(null);
    setLegalMoves([]); setResult(null); setLastMove(null);
    setMoveCount(0); setShowPrompt(false); setBotThinking(false);
  }

  function handleSignup()   { navigate('/login?signup=1'); }
  function handleContinue() { setShowPrompt(false); resetGame(); }

  return (
    <div className="page" style={{ alignItems: 'center', padding: '16px' }}>
      <SignupPrompt
        show={showPrompt}
        result={result}
        moveCount={moveCount}
        onSignup={handleSignup}
        onContinue={handleContinue}
      />

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', maxWidth:560, marginBottom:8 }}>
        <div style={{ fontSize:13, color:'var(--text-muted)' }}>
          🎮 Guest · {diffLabel}
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleSignup} style={{ fontSize:12 }}>
          🚀 Create Account
        </button>
      </div>

      {/* Bot bar */}
      <div className="player-bar" style={{ width:'100%', maxWidth:560, marginBottom:4 }}>
        <div className="player-bar-left">
          <div className="player-bar-avatar" style={{ background:'#1a1a2e', fontSize:18 }}>🤖</div>
          <div className="player-bar-info">
            <div className="player-bar-name"><span className="color-dot black"/>Checkers Bot</div>
            <div className="player-bar-rating">{botThinking ? '💭 thinking...' : diffLabel}</div>
          </div>
        </div>
      </div>

      <GuestBoard
        board={board} selected={selected}
        legalMoves={selected ? legalMoves : currentLegal}
        onSquareClick={handleSquareClick} lastMove={lastMove}
      />

      {/* Player bar */}
      <div className="player-bar" style={{ width:'100%', maxWidth:560, marginTop:4 }}>
        <div className="player-bar-left">
          <div className="player-bar-avatar" style={{ background:'var(--accent)', color:'#000', fontWeight:900, fontSize:14 }}>G</div>
          <div className="player-bar-info">
            <div className="player-bar-name"><span className="color-dot red"/>You (Guest)</div>
            <div className="player-bar-rating">Guest mode · stats not saved</div>
          </div>
        </div>
        <div style={{ fontSize:13, color:'var(--text-muted)' }}>{moveCount} moves</div>
      </div>

      {/* Sign up CTA banner */}
      <div style={{
        marginTop:16, padding:'16px 24px',
        background:'rgba(129,182,76,0.08)', border:'1px solid rgba(129,182,76,0.2)',
        borderRadius:'var(--radius-lg)', textAlign:'center', maxWidth:560, width:'100%',
      }}>
        <div style={{ fontSize:14, fontWeight:800, marginBottom:4 }}>Want to play real players?</div>
        <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:10 }}>
          Sign up free to earn ELO, track stats, and compete on the leaderboard.
        </div>
        <button className="btn btn-primary" onClick={handleSignup} style={{ padding:'9px 24px', fontSize:13 }}>
          Sign Up Free →
        </button>
      </div>
    </div>
  );
}