import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Board from '../components/Board';
import { moveToString } from '../utils/helpers';

// ── Checkers engine (client-side copy for bot) ────────────────────────────────
const EMPTY = 0, RED = 1, RED_KING = 2, BLACK = 3, BLACK_KING = 4;
function isRed(p)   { return p === RED || p === RED_KING; }
function isBlack(p) { return p === BLACK || p === BLACK_KING; }
function isKing(p)  { return p === RED_KING || p === BLACK_KING; }
function ownerColor(p) { return isRed(p) ? 'red' : isBlack(p) ? 'black' : null; }
function inBounds(r,c)  { return r>=0&&r<8&&c>=0&&c<8; }
function isOpp(p, color) { return color==='red' ? isBlack(p) : isRed(p); }
function cloneBoard(b) { return b.map(r=>[...r]); }

function getDirs(piece) {
  const d=[];
  if (piece===RED||piece===RED_KING||piece===BLACK_KING) d.push([-1,-1],[-1,1]);
  if (piece===BLACK||piece===BLACK_KING||piece===RED_KING) d.push([1,-1],[1,1]);
  return d;
}

function createBoard() {
  const b = Array.from({length:8},()=>Array(8).fill(EMPTY));
  for(let r=0;r<3;r++) for(let c=0;c<8;c++) if((r+c)%2===0) b[r][c]=BLACK;
  for(let r=5;r<8;r++) for(let c=0;c<8;c++) if((r+c)%2===0) b[r][c]=RED;
  return b;
}

function getCaptures(board, r, c, color, king) {
  const seqs=[]; const orig=board[r][c];
  function dfs(b,cr,cc,path,caps,crowned) {
    const dirs = crowned||king ? [[-1,-1],[-1,1],[1,-1],[1,1]] : getDirs(orig);
    let found=false;
    for(const [dr,dc] of dirs) {
      const mr=cr+dr,mc=cc+dc,lr=cr+2*dr,lc=cc+2*dc;
      if(!inBounds(mr,mc)||!inBounds(lr,lc)) continue;
      if(!isOpp(b[mr][mc],color)) continue;
      if(b[lr][lc]!==EMPTY) continue;
      if(caps.some(([x,y])=>x===mr&&y===mc)) continue;
      found=true;
      const nb=cloneBoard(b);
      nb[lr][lc]=nb[cr][cc]; nb[cr][cc]=EMPTY; nb[mr][mc]=EMPTY;
      const justCrown=!crowned&&!king&&((color==='red'&&lr===0)||(color==='black'&&lr===7));
      if(justCrown) nb[lr][lc]=color==='red'?RED_KING:BLACK_KING;
      const np=[...path,[lr,lc]], nc=[...caps,[mr,mc]];
      if(justCrown) seqs.push({from:[r,c],to:[lr,lc],captures:nc,path:np});
      else dfs(nb,lr,lc,np,nc,crowned);
    }
    if(!found&&caps.length>0) seqs.push({from:[r,c],to:[cr,cc],captures:[...caps],path:[...path]});
  }
  dfs(board,r,c,[[r,c]],[],false);
  return seqs;
}

function getSimple(board,r,c) {
  const p=board[r][c]; if(p===EMPTY) return [];
  const moves=[];
  for(const [dr,dc] of getDirs(p)) {
    const nr=r+dr,nc=c+dc;
    if(inBounds(nr,nc)&&board[nr][nc]===EMPTY)
      moves.push({from:[r,c],to:[nr,nc],captures:[],path:[[r,c],[nr,nc]]});
  }
  return moves;
}

function getLegalMoves(board, color) {
  let caps=[],simples=[];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    const p=board[r][c];
    if(p===EMPTY||ownerColor(p)!==color) continue;
    const c2=getCaptures(board,r,c,color,isKing(p));
    if(c2.length) caps.push(...c2);
    else simples.push(...getSimple(board,r,c));
  }
  if(caps.length) { const m=Math.max(...caps.map(x=>x.captures.length)); return caps.filter(x=>x.captures.length===m); }
  return simples;
}

function applyMove(board, move) {
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

function getResult(board, turn) {
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

function countPieces(board, color) {
  let men=0,kings=0;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    const p=board[r][c];
    if(ownerColor(p)===color) { if(isKing(p)) kings++; else men++; }
  }
  return men+kings*2.5;
}

function minimax(board, turn, depth, alpha, beta, maxing, botColor) {
  const res=getResult(board,turn);
  if(res) return res===`${botColor}_win` ? 1000+depth : res==='draw' ? 0 : -1000-depth;
  if(depth===0) return countPieces(board,botColor)-countPieces(board,botColor==='red'?'black':'red');
  const moves=getLegalMoves(board,turn);
  const next=turn==='red'?'black':'red';
  if(maxing) {
    let best=-Infinity;
    for(const m of moves) { const v=minimax(applyMove(board,m),next,depth-1,alpha,beta,false,botColor); best=Math.max(best,v); alpha=Math.max(alpha,v); if(beta<=alpha) break; }
    return best;
  } else {
    let best=Infinity;
    for(const m of moves) { const v=minimax(applyMove(board,m),next,depth-1,alpha,beta,true,botColor); best=Math.min(best,v); beta=Math.min(beta,v); if(beta<=alpha) break; }
    return best;
  }
}

function getBotMove(board, botColor, difficulty) {
  const moves=getLegalMoves(board,botColor);
  if(!moves.length) return null;
  if(difficulty==='easy') {
    if(Math.random()<0.7) return moves[Math.floor(Math.random()*moves.length)];
    const caps=moves.filter(m=>m.captures.length>0);
    return (caps.length?caps:moves)[Math.floor(Math.random()*(caps.length||moves.length))];
  }
  const depth=difficulty==='hard'?6:3;
  if(difficulty==='medium'&&Math.random()<0.2) return moves[Math.floor(Math.random()*moves.length)];
  let bestVal=-Infinity, bestMoves=[];
  const next=botColor==='red'?'black':'red';
  for(const m of moves) {
    const v=minimax(applyMove(board,m),next,depth,-Infinity,Infinity,false,botColor);
    if(v>bestVal){bestVal=v;bestMoves=[m];}
    else if(v===bestVal) bestMoves.push(m);
  }
  return bestMoves[Math.floor(Math.random()*bestMoves.length)];
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function BotGamePage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const difficulty = location.state?.difficulty || 'medium';

  const playerColor = 'red'; // player is always red, bot is black
  const botColor    = 'black';

  const [board,    setBoard]    = useState(createBoard());
  const [turn,     setTurn]     = useState('red');
  const [moves,    setMoves]    = useState([]);
  const [boardHistory, setBoardHistory] = useState([createBoard()]);
  const [result,   setResult]   = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [chatMessages, setChatMessages] = useState([
    { from: 'Bot', message: `Good luck! I'm playing on ${difficulty} difficulty.` }
  ]);
  const [thinkingMsg, setThinkingMsg] = useState(null);
  const botTimerRef = useRef(null);

  const diffLabel = difficulty === 'easy' ? '🟢 Easy' : difficulty === 'medium' ? '🟡 Medium' : '🔴 Hard';

  // Bot move
  useEffect(() => {
    if (turn !== botColor || result) return;
    if (botTimerRef.current) clearTimeout(botTimerRef.current);

    const thinkTime = difficulty === 'easy' ? 400 : difficulty === 'medium' ? 800 : 1200;
    setThinkingMsg('thinking...');

    botTimerRef.current = setTimeout(() => {
      setThinkingMsg(null);
      const move = getBotMove(board, botColor, difficulty);
      if (!move) { setResult('red_win'); return; }

      const newBoard = applyMove(board, move);
      const newMoves = [...moves, { color: botColor, ...move }];
      const newHistory = [...boardHistory, cloneBoard(newBoard)];

      setBoard(newBoard);
      setMoves(newMoves);
      setBoardHistory(newHistory);
      setLastMove({ color: botColor, ...move });

      const nextTurn = 'red';
      const res = getResult(newBoard, nextTurn);
      if (res) setResult(res);
      else setTurn(nextTurn);
    }, thinkTime);

    return () => { if (botTimerRef.current) clearTimeout(botTimerRef.current); };
  }, [turn, board, result]);

  function handleMove(from, to) {
    if (turn !== playerColor || result) return;
    const legal = getLegalMoves(board, playerColor);
    const move = legal.find(m => m.from[0]===from[0]&&m.from[1]===from[1]&&m.to[0]===to[0]&&m.to[1]===to[1]);
    if (!move) return;

    const newBoard = applyMove(board, move);
    const newMoves = [...moves, { color: playerColor, ...move }];
    const newHistory = [...boardHistory, cloneBoard(newBoard)];

    setBoard(newBoard);
    setMoves(newMoves);
    setBoardHistory(newHistory);
    setLastMove({ color: playerColor, ...move });

    const nextTurn = 'black';
    const res = getResult(newBoard, nextTurn);
    if (res) setResult(res);
    else setTurn(nextTurn);
  }

  function resetGame() {
    const b = createBoard();
    setBoard(b); setTurn('red'); setMoves([]); setBoardHistory([b]);
    setResult(null); setLastMove(null); setThinkingMsg(null);
    setChatMessages([{ from: 'Bot', message: `Ready for another round! ${diffLabel}` }]);
  }

  const legalMoves = turn === playerColor && !result ? getLegalMoves(board, playerColor) : [];

  let resultText = '', resultEmoji = '';
  if (result === 'red_win') { resultText = 'You Win!'; resultEmoji = '🏆'; }
  else if (result === 'black_win') { resultText = 'Bot Wins'; resultEmoji = '🤖'; }
  else if (result === 'draw') { resultText = 'Draw'; resultEmoji = '🤝'; }

  const movePairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({ num: Math.floor(i/2)+1, red: moves[i], black: moves[i+1]||null });
  }

  const myAvatar = localStorage.getItem(`avatar_${user.id}`);

  return (
    <div className="page game-page">
      <div className="game-layout">
        <div className="game-board-col">

          {/* Bot player bar */}
          <div className="player-bar">
            <div className="player-bar-left">
              <div className="player-bar-avatar" style={{ background: '#1a1a2e', fontSize: 20 }}>🤖</div>
              <div className="player-bar-info">
                <div className="player-bar-name">
                  <span className="color-dot black" />
                  Checkers Bot
                </div>
                <div className="player-bar-rating">{diffLabel}</div>
              </div>
            </div>
            {thinkingMsg && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: '50%', animation: 'pulse 1s infinite' }} />
                {thinkingMsg}
              </div>
            )}
          </div>

          {/* Board */}
          <div style={{ position: 'relative' }}>
            <Board
              board={board} myColor={playerColor} turn={turn}
              legalMoves={legalMoves} onMove={handleMove}
              gameOver={!!result} lastMove={lastMove}
            />

            {result && (
              <div className="game-over-overlay">
                <div className="game-over-box">
                  <div className="game-over-emoji">{resultEmoji}</div>
                  <h2>{resultText}</h2>
                  <div className="game-over-subtitle">{moves.length} moves</div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={resetGame}>🔄 Play Again</button>
                    <button className="btn btn-secondary" onClick={() => navigate('/')}>🏠 Home</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Player bar */}
          <div className={`player-bar${turn === playerColor && !result ? ' active' : ''}`}>
            <div className="player-bar-left">
              <div className="player-bar-avatar">
                {myAvatar ? <img src={myAvatar} alt={user.username} /> : user.username[0].toUpperCase()}
              </div>
              <div className="player-bar-info">
                <div className="player-bar-name">
                  <span className="color-dot red" />
                  {user.username} (You)
                </div>
                <div className="player-bar-rating">{user.elo} ELO</div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="game-sidebar">
          <div className="sidebar-section">
            <div className="sidebar-header"><span className="sidebar-header-icon">🤖</span> Bot Game</div>
            <div className="sidebar-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Difficulty: <strong style={{ color: 'var(--text-primary)' }}>{diffLabel}</strong></div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No time limit · No ELO at stake</div>
              {!result && (
                <button className="btn btn-ghost btn-sm" onClick={resetGame} style={{ marginTop: 4 }}>↺ New Game</button>
              )}
            </div>
          </div>

          <div className="sidebar-section" style={{ flex: 1 }}>
            <div className="sidebar-header"><span className="sidebar-header-icon">📋</span> Moves</div>
            <div className="sidebar-body" style={{ padding: '6px 4px' }}>
              <div className="move-list" style={{ maxHeight: 300 }}>
                {movePairs.length === 0 ? (
                  <div className="no-moves">No moves yet</div>
                ) : movePairs.map(({ num, red, black }) => (
                  <div key={num} className="move-row">
                    <span className="move-num">{num}.</span>
                    <span className="move-cell">{red ? moveToString(red) : ''}</span>
                    <span className="move-cell">{black ? moveToString(black) : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-header"><span className="sidebar-header-icon">💬</span> Bot Chat</div>
            <div className="sidebar-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, maxHeight: 120, overflowY: 'auto' }}>
                {chatMessages.map((m, i) => (
                  <div key={i} className="chat-msg">
                    <span className="chat-msg-user">{m.from}: </span>
                    <span className="chat-msg-text">{m.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => navigate('/')}>← Back to Home</button>
        </div>
      </div>
    </div>
  );
}