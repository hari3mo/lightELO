import React, { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { ChessBoard } from './components/ChessBoard';
import { PlayerCapturedBar } from './components/CapturedBar';
import { ChessPiece } from './components/ChessPieces';
import { getAIMove } from './utils/ai';
import { detectOpening, classifyEco } from './utils/openings';
import Evaluation, { stockfish } from './utils/stockfish';
import { ScramblingDigits } from './components/PredictionLoaders';
import { BoardTheme, GameMode, GameMove, AIDifficulty, PieceType } from './types';
import { Toaster, toast } from 'sonner';
import {
  User,
  RefreshCw,
  Share2,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  ChevronRight,
  Upload,
  RotateCcw,
  Sun,
  Moon,
  Github,
} from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Premium chess interface board themes
const BOARDS_THEMES: BoardTheme[] = [
  {
    id: 'chess-com-green',
    name: 'Chess.com Green',
    lightSquare: '#eeeed2',
    darkSquare: '#769656',
    lightHighlight: '#f7f785',
    darkHighlight: '#baca44',
    background: 'bg-emerald-500/5',
    primary: 'emerald',
    primaryLight: 'bg-emerald-50 dark:bg-emerald-950/20',
    accent: 'emerald',
  },
  {
    id: 'grandmaster-zinc',
    name: 'Grandmaster Zinc',
    lightSquare: '#F4F4F5',
    darkSquare: '#A1A1AA',
    lightHighlight: '#FDE047',
    darkHighlight: '#EAB308',
    background: 'bg-zinc-50 dark:bg-zinc-950',
    primary: 'zinc',
    primaryLight: 'bg-zinc-100 dark:bg-zinc-900',
    accent: 'zinc',
  },
  {
    id: 'sandy-walnut',
    name: 'Walnut Classic',
    lightSquare: '#F0D9B5',
    darkSquare: '#B58863',
    lightHighlight: '#EACD7A',
    darkHighlight: '#DAA54D',
    background: 'bg-amber-500/5',
    primary: 'amber',
    primaryLight: 'bg-amber-50',
    accent: 'amber',
  },
  {
    id: 'polar-slate',
    name: 'Polar Slate',
    lightSquare: '#ECECD7',
    darkSquare: '#8A9A86',
    lightHighlight: '#C4DD79',
    darkHighlight: '#A4C639',
    background: 'bg-slate-500/5',
    primary: 'slate',
    primaryLight: 'bg-slate-100',
    accent: 'slate',
  },
  {
    id: 'deep-navy',
    name: 'Navy Parchment',
    lightSquare: '#ECECD7',
    darkSquare: '#4B7399',
    lightHighlight: '#D1E67C',
    darkHighlight: '#AACC00',
    background: 'bg-blue-500/5',
    primary: 'blue',
    primaryLight: 'bg-blue-50',
    accent: 'blue',
  },
  {
    id: 'cyber-neon',
    name: 'Cyber Neon',
    lightSquare: '#251D3A',
    darkSquare: '#00ADB5',
    lightHighlight: '#10B981',
    darkHighlight: '#F43F5E',
    background: 'bg-indigo-500/5',
    primary: 'indigo',
    primaryLight: 'bg-indigo-950/40',
    accent: 'cyan',
  }
];

function clockToSeconds(clock?: string): string {
  if (!clock) return ''; // Backend needs to know it's empty to handle it gracefully if bypassing above checks

  // Clean up potential formatting oddities
  const cleanClock = clock.replace(/[^0-9:]/g, '');
  const parts = cleanClock.split(':');

  if (parts.length !== 3) return '';
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const s = parseFloat(parts[2]) || 0;

  return String(Math.round(h * 3600 + m * 60 + s));
}

const StyledMove = ({ san, color, isActive, onClick, onBoardPieceCode }: { san: string, color: 'w' | 'b', isActive?: boolean, onClick?: () => void, onBoardPieceCode?: string }) => {
  const moveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive && moveRef.current) {
      moveRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isActive]);

  if (!san) return null;

  let pieceType: PieceType | null = null;
  let restOfMove = san;

  if (san.startsWith('K')) { pieceType = 'k'; restOfMove = san.slice(1); }
  else if (san.startsWith('Q')) { pieceType = 'q'; restOfMove = san.slice(1); }
  else if (san.startsWith('R')) { pieceType = 'r'; restOfMove = san.slice(1); }
  else if (san.startsWith('B')) { pieceType = 'b'; restOfMove = san.slice(1); }
  else if (san.startsWith('N')) { pieceType = 'n'; restOfMove = san.slice(1); }

  const isCastle = san.includes('O-O') || san.includes('0-0');
  const displaySan = isCastle ? san.replace(/0/g, 'O') : san;

  return (
    <div ref={moveRef} onClick={onClick} className={`flex w-full min-w-0 items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer transition-all duration-150 ${isActive ? 'bg-zinc-200 dark:bg-zinc-700/60 ring-1 ring-inset ring-zinc-300/80 dark:ring-zinc-600/60 shadow-sm' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/70'}`}>
      {pieceType && (
        <div className="w-4 h-4 shrink-0 flex items-center justify-center -ml-0.5" style={{ filter: color === 'w' ? 'drop-shadow(0px 1px 1px rgba(0,0,0,0.1))' : 'drop-shadow(0px 1px 1px rgba(255,255,255,0.05))' }}>
          <ChessPiece type={pieceType} color={color} />
        </div>
      )}
      <span className={`text-[13px] ${isCastle ? 'font-sans' : 'font-mono'} tracking-tight font-bold ${isActive ? 'text-zinc-900 dark:text-zinc-100' : color === 'w' ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-700 dark:text-zinc-300'}`}>
        {pieceType ? restOfMove : displaySan}
      </span>
    </div>
  );
};

export default function App() {
  // Game states
  const [gameMode, setGameMode] = useState<GameMode>('predictor');
  const [fen, setFen] = useState<string>('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const [history, setHistory] = useState<GameMove[]>([]);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [activeTheme, setActiveTheme] = useState<BoardTheme>(BOARDS_THEMES[0]);
  const [showCoordinates, setShowCoordinates] = useState<boolean>(true);

  // Tournament Chess Clocks
  const [whiteTime, setWhiteTime] = useState<number>(600); // 10 minutes default
  const [blackTime, setBlackTime] = useState<number>(600);
  const [isTimeOver, setIsTimeOver] = useState<boolean>(false);

  // Custom interactive board selections
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [highlightedMoves, setHighlightedMoves] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);

  // AI config state
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('intermediate');
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w'); // In AI mode: which color human plays
  const [aiThinking, setAiThinking] = useState<boolean>(false);

  // FEN paste input state
  const [pgnInputText, setPgnInputText] = useState<string>('');
  const [isPgnInvalid, setIsPgnInvalid] = useState<boolean>(false);
  const [pgnErrorMsg, setPgnErrorMsg] = useState<string>('');
  const [isRawPgnMode, setIsRawPgnMode] = useState<boolean>(false);
  const [fenInput, setFenInput] = useState<string>('');

  const [redoStack, setRedoStack] = useState<GameMove[]>([]);

  const [predictedWhiteElo, setPredictedWhiteElo] = useState<number | null>(null);
  const [predictedBlackElo, setPredictedBlackElo] = useState<number | null>(null);
  const [isPredicting, setIsPredicting] = useState<boolean>(false);
  const [pgnHeaders, setPgnHeaders] = useState<Record<string, string>>({});
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  // Apply dark mode to root element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Instantiate standard chess engine
  const [chess, setChess] = useState<Chess>(new Chess());

  // Sync PGN string smoothly
  useEffect(() => {
    if (document.activeElement?.id === 'pgn-input') return;
    if (redoStack.length > 0) return;
    const movesOnly = chess.pgn().replace(/^\[[a-zA-Z]+\s+".*?"\]\s*\n?/gm, '').replace(/\{[^}]*\}/g, '').replace(/\s*\*$/, '').replace(/\s+/g, ' ').trim();
    setPgnInputText(movesOnly);
  }, [chess, redoStack.length]);

  // Derive board status variables
  const activeColor = chess.turn();
  const isGameOver = chess.isGameOver();
  const inCheck = chess.inCheck();

  // Locate king on active square for check glows
  const findKingSquare = (c: Chess, color: 'w' | 'b'): string | null => {
    const board = c.board();
    for (let r = 0; r < 8; r++) {
      for (let cCol = 0; cCol < 8; cCol++) {
        const p = board[r][cCol];
        if (p && p.type === 'k' && p.color === color) {
          const filesArr = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
          const ranksArr = ['8', '7', '6', '5', '4', '3', '2', '1'];
          return filesArr[cCol] + ranksArr[r];
        }
      }
    }
    return null;
  };

  const kingInCheckSq = inCheck ? findKingSquare(chess, chess.turn()) : null;

  const parsePgnToState = (content: string, isUpload: boolean = false) => {
    const newChess = new Chess();
    try {
      newChess.loadPgn(content);

      const hasHeaders = content.includes('[');
      if (!hasHeaders && Object.keys(pgnHeaders).length > 0) {
        for (const [key, value] of Object.entries(pgnHeaders)) {
          newChess.header(key, value as string);
        }
      }

      const headers = newChess.header();
      setPgnHeaders(headers);
      setChess(newChess);
      setFen(newChess.fen());

      const comments = typeof newChess.getComments === 'function' ? newChess.getComments() : [];

      const moves = newChess.history({ verbose: true });
      const reconstructed: GameMove[] = [];
      const tempChess = new Chess();
      let hasAnyClock = false;
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        const fb = tempChess.fen();
        tempChess.move(m.san);
        const fa = tempChess.fen();

        let comment = undefined;
        let clockTime = undefined;
        const cObj = comments.find((c: any) => c.fen === fa);
        if (cObj && cObj.comment) {
          comment = cObj.comment;
          const clockMatch = comment.match(/\[%clk\s+([^\]]+)\]/);
          if (clockMatch) {
            clockTime = clockMatch[1];
            hasAnyClock = true;
          }
        }

        reconstructed.push({
          ...m,
          color: m.color as 'w' | 'b',
          piece: m.piece as any,
          captured: m.captured as any,
          fenBefore: fb,
          fenAfter: fa,
          comment,
          clockTime
        });
      }

      if (isUpload && moves.length > 0 && !hasAnyClock) {
        throw new Error("Uploaded PGN must include clock timestamps ([%clk ...])");
      }

      setHistory(reconstructed);
      setRedoStack([]);

      setIsPgnInvalid(false);
      setPgnErrorMsg('');
    } catch (e: any) {
      if (isUpload) {
        toast.error(e.message || 'Invalid PGN');
      }
      setIsPgnInvalid(true);
      setPgnErrorMsg(e.message || 'Invalid PGN');
    }
  };

  // Live decrement logic for the active player's clock
  useEffect(() => {
    if (isGameOver || isTimeOver || gameMode === 'sandbox' || gameMode === 'puzzle' || Object.keys(pgnHeaders).length > 0 || history.length === 0) return;

    const interval = setInterval(() => {
      if (chess.turn() === 'w') {
        setWhiteTime(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            setIsTimeOver(true);
            toast.error('Flagged! Black wins on time.');
            return 0;
          }
          return prev - 1;
        });
      } else {
        setBlackTime(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            setIsTimeOver(true);
            toast.error('Flagged! White wins on time.');
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [chess.turn(), isGameOver, isTimeOver, gameMode]);

  // Handle AI turn triggers
  useEffect(() => {
    if (gameMode !== 'ai' || isGameOver || aiThinking) return;

    // Is it the bot's turn to play?
    const isBotTurn = chess.turn() !== playerColor;
    if (isBotTurn) {
      setAiThinking(true);

      // Delay slightly (300ms) to simulate computational thought
      const timer = setTimeout(() => {
        try {
          const possibleMoves = chess.moves({ verbose: true });
          if (possibleMoves.length > 0) {
            const bestMoveLan = getAIMove(chess.fen(), aiDifficulty);
            if (bestMoveLan) {
              const from = bestMoveLan.slice(0, 2);
              const to = bestMoveLan.slice(2, 4);
              const promotion = bestMoveLan.length > 4 ? bestMoveLan.charAt(4) : undefined;

              executePhysicalMove(from, to, promotion, true);
            }
          }
        } catch (e) {
          console.error("AI execution failed", e);
        } finally {
          setAiThinking(false);
        }
      }, 400);

      return () => clearTimeout(timer);
    }
  }, [fen, gameMode, playerColor, isGameOver, aiDifficulty]);

  // Dynamic status descriptor
  const getGameStatusText = (): string => {
    if (chess.isCheckmate()) {
      const winner = chess.turn() === 'w' ? 'Black' : 'White';
      return `Checkmate! ${winner} Wins.`;
    }
    if (chess.isDraw()) {
      if (chess.isStalemate()) return 'Stalemate! Game is Drawn.';
      if (chess.isThreefoldRepetition()) return 'Draw by Threefold Repetition.';
      if (chess.isInsufficientMaterial()) return 'Draw by Insufficient Material.';
      return 'Game Drawn.';
    }
    if (chess.inCheck()) {
      const checkingSide = chess.turn() === 'w' ? 'White' : 'Black';
      return `Check! ${checkingSide} to play.`;
    }

    // Normal turn
    const activeTurnSide = chess.turn() === 'w' ? 'White to Move' : 'Black to Move';
    if (gameMode === 'ai') {
      const isBotActive = chess.turn() !== playerColor;
      return isBotActive ? `Computer (${aiDifficulty}) is thinking...` : `Your Turn (${playerColor === 'w' ? 'White' : 'Black'})`;
    }
    return activeTurnSide;
  };

  // Perform physical state transition
  const formatTimeForPgn = (timeInSeconds: number) => {
    const h = Math.floor(timeInSeconds / 3600);
    const m = Math.floor((timeInSeconds % 3600) / 60);
    const s = timeInSeconds % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const executePhysicalMove = (from: string, to: string, promotion?: string, botMove?: boolean) => {
    try {
      const freshChess = new Chess();
      if (chess.pgn()) {
        freshChess.loadPgn(chess.pgn());
      } else {
        freshChess.load(chess.fen());
      }

      // Save move analytics
      const moveResult = freshChess.move({ from, to, promotion: promotion || 'q' });

      if (moveResult) {
        const timeStr = formatTimeForPgn(chess.turn() === 'w' ? whiteTime : blackTime);
        if (history.length > 0 || !botMove) {
          freshChess.setComment(`[%clk ${timeStr}]`);
        }

        // Build GameMove payload
        const movePayload: GameMove = {
          san: moveResult.san,
          from,
          to,
          color: moveResult.color,
          piece: moveResult.piece,
          captured: moveResult.captured,
          promotion: moveResult.promotion,
          fenBefore: chess.fen(),
          fenAfter: freshChess.fen(),
          clockTime: timeStr
        };

        // Apply state updates
        setChess(freshChess);
        setFen(freshChess.fen());
        setHistory(prev => [...prev, movePayload]);
        setRedoStack([]);
        setLastMove({ from, to });

        // Highlight king in check if necessary
        if (freshChess.inCheck()) {
          if (freshChess.isCheckmate()) {
            toast.success(`Checkmate! ${moveResult.color === 'w' ? 'White' : 'Black'} wins.`);
          } else {
            toast.warning('Check!');
          }
        }
      }
    } catch (e) {
      console.error(e);
      toast.error('Illegal move!');
    }
  };

  // Mathematical capture calculations
  const calculateCapturedPieces = () => {
    const initialCounts: Record<PieceType, number> = { p: 8, r: 2, n: 2, b: 2, q: 1, k: 1 };

    const countOnBoard = {
      w: { p: 0, r: 0, n: 0, b: 0, q: 0, k: 0 },
      b: { p: 0, r: 0, n: 0, b: 0, q: 0, k: 0 }
    };

    const board = chess.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p) {
          countOnBoard[p.color][p.type]++;
        }
      }
    }

    const capturedByWhite: PieceType[] = []; // Black pieces captured
    const capturedByBlack: PieceType[] = []; // White pieces captured

    const types: PieceType[] = ['p', 'b', 'n', 'r', 'q'];
    types.forEach(t => {
      const whiteTradDiff = initialCounts[t] - countOnBoard.w[t];
      for (let i = 0; i < whiteTradDiff; i++) capturedByBlack.push(t);

      const blackTradDiff = initialCounts[t] - countOnBoard.b[t];
      for (let i = 0; i < blackTradDiff; i++) capturedByWhite.push(t);
    });

    return { capturedByWhite, capturedByBlack };
  };

  const { capturedByWhite, capturedByBlack } = calculateCapturedPieces();

  const PIECE_SCORES: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const whiteCapturedScore = capturedByWhite.reduce((sum, type) => sum + PIECE_SCORES[type], 0);
  const blackCapturedScore = capturedByBlack.reduce((sum, type) => sum + PIECE_SCORES[type], 0);
  const whiteAdvantage = whiteCapturedScore - blackCapturedScore;
  const blackAdvantage = blackCapturedScore - whiteCapturedScore;

  // Undo last action helper
  const handleUndoMove = () => {
    if (history.length === 0) return;

    try {
      const freshChess = new Chess();
      if (chess.pgn()) {
        freshChess.loadPgn(chess.pgn());
      } else {
        freshChess.load(chess.fen());
      }

      freshChess.undo(); // Undo player's move

      let elementsToRemove = 1;

      // In vs AI mode, undoing should revert BOTH the AI's move AND the player's last move
      if (gameMode === 'ai' && history.length >= 2) {
        freshChess.undo();
        elementsToRemove = 2;
      }

      const undoneMoves = history.slice(-elementsToRemove).reverse();
      const targetHistory = history.slice(0, -elementsToRemove);

      setChess(freshChess);
      setFen(freshChess.fen());
      setHistory(targetHistory);
      setRedoStack(prev => [...prev, ...undoneMoves]);
      setLastMove(targetHistory.length > 0 ? { from: targetHistory[targetHistory.length - 1].from, to: targetHistory[targetHistory.length - 1].to } : null);

      setSelectedSquare(null);
      setHighlightedMoves([]);
    } catch (e) {
      console.error("Undo move failed", e);
    }
  };

  const handleFastForward = () => {
    if (redoStack.length === 0) return;

    try {
      const freshChess = new Chess();
      if (chess.pgn()) {
        freshChess.loadPgn(chess.pgn());
      } else {
        freshChess.load(chess.fen());
      }

      const playedMoves = [...redoStack].reverse();
      for (const m of playedMoves) {
        freshChess.move(m.san);
      }

      const targetHistory = [...history, ...playedMoves];

      setChess(freshChess);
      setFen(freshChess.fen());
      setHistory(targetHistory);
      setRedoStack([]);
      setLastMove(targetHistory.length > 0 ? { from: targetHistory[targetHistory.length - 1].from, to: targetHistory[targetHistory.length - 1].to } : null);

      setSelectedSquare(null);
      setHighlightedMoves([]);
    } catch (e) {
      console.error("Fast forward failed", e);
    }
  };

  const handleRedoMove = () => {
    if (redoStack.length === 0) return;

    try {
      const freshChess = new Chess();
      if (chess.pgn()) {
        freshChess.loadPgn(chess.pgn());
      } else {
        freshChess.load(chess.fen());
      }

      let elementsToRedo = 1;
      const firstRedo = redoStack[redoStack.length - 1];
      freshChess.move(firstRedo.san);

      if (gameMode === 'ai' && redoStack.length >= 2) {
        const secondRedo = redoStack[redoStack.length - 2];
        freshChess.move(secondRedo.san);
        elementsToRedo = 2;
      }

      const playedMoves = redoStack.slice(-elementsToRedo).reverse();
      const targetHistory = [...history, ...playedMoves];

      setChess(freshChess);
      setFen(freshChess.fen());
      setHistory([...history, ...playedMoves]);
      setRedoStack(prev => prev.slice(0, -elementsToRedo));
      setLastMove(targetHistory.length > 0 ? { from: targetHistory[targetHistory.length - 1].from, to: targetHistory[targetHistory.length - 1].to } : null);

      setSelectedSquare(null);
      setHighlightedMoves([]);
    } catch (e) {
      console.error("Redo move failed", e);
    }
  };

  const handleRewindAll = () => {
    if (history.length === 0) return;

    try {
      const freshChess = new Chess();
      if (history[0].fenBefore) {
        freshChess.load(history[0].fenBefore);
      }

      const undoneMoves = [...history].reverse();

      setChess(freshChess);
      setFen(freshChess.fen());
      setHistory([]);
      setRedoStack(prev => [...prev, ...undoneMoves]);
      setLastMove(null);

      setSelectedSquare(null);
      setHighlightedMoves([]);
    } catch (e) {
      console.error("Rewind failed", e);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          handleUndoMove();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleRedoMove();
          break;
        case 'ArrowUp':
          e.preventDefault();
          handleRewindAll();
          break;
        case 'ArrowDown':
          e.preventDefault();
          handleFastForward();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndoMove, handleRedoMove, handleRewindAll, handleFastForward]);

  const handleJumpToMove = (targetIndex: number) => {
    const fullHistory = [...history, ...[...redoStack].reverse()];
    if (targetIndex < -1 || targetIndex >= fullHistory.length) return;

    const currentMoveIndex = history.length - 1;
    if (targetIndex === currentMoveIndex) return;

    try {
      const freshChess = new Chess();
      if (fullHistory[0]?.fenBefore) {
        freshChess.load(fullHistory[0].fenBefore);
      }

      const newHistory = fullHistory.slice(0, targetIndex + 1);
      const newRedoStack = fullHistory.slice(targetIndex + 1).reverse();

      // Preserve headers
      if (Object.keys(pgnHeaders).length > 0) {
        for (const [key, value] of Object.entries(pgnHeaders)) {
          freshChess.header(key, value as string);
        }
      }

      for (const move of newHistory) {
        freshChess.move(move.san);
        if (move.clockTime) {
          freshChess.setComment(`[%clk ${move.clockTime}]`);
        }
      }

      setChess(freshChess);
      setFen(freshChess.fen());
      setHistory(newHistory);
      setRedoStack(newRedoStack);
      setLastMove(newHistory.length > 0 ? { from: newHistory[newHistory.length - 1].from, to: newHistory[newHistory.length - 1].to } : null);

      setSelectedSquare(null);
      setHighlightedMoves([]);
    } catch (e) {
      console.error("Jump move failed", e);
    }
  };

  // Reset standard setup board
  const handleResetBoard = () => {
    const freshChess = new Chess();
    setChess(freshChess);
    setFen(freshChess.fen());
    setHistory([]);
    setRedoStack([]);
    setLastMove(null);
    setSelectedSquare(null);
    setHighlightedMoves([]);
    setWhiteTime(600);
    setBlackTime(600);
    setIsTimeOver(false);
    setPgnHeaders({});
    setPgnInputText('');
    setPredictedWhiteElo(null);
    setPredictedBlackElo(null);
    toast.success('Chessboard reset successfully.');
  };

  // FEN Paste manual load
  const handleLoadCustomFen = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fenInput.trim()) return;

    try {
      const testChess = new Chess(fenInput.trim());
      setFen(fenInput.trim());
      setHistory([]);
      setRedoStack([]);
      setLastMove(null);
      setSelectedSquare(null);
      setHighlightedMoves([]);
      setWhiteTime(600);
      setBlackTime(600);
      setIsTimeOver(false);
      toast.success('Custom position loaded successfully.');
    } catch (err) {
      toast.error('Invalid FEN code structure. Check coordinate format.');
    }
  };

  // Predict Elo: compute Stockfish evals client-side, then POST to backend for the model.
  useEffect(() => {
    // Check if we actually have clock data before predicting
    const hasClocks = history.some(m => m.clockTime);

    if (!hasClocks) {
      setPredictedWhiteElo(null);
      setPredictedBlackElo(null);
      setIsPredicting(false);
      return;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setIsPredicting(true);
      try {
        // Compute per-ply evals client-side (White's POV, pawns; mates clamped ±100),
        // matching the training eval format. The server runs the model only.
        const evalsArr: string[] = [];
        for (const m of history) {
          const ev = await stockfish.eval(m.fenAfter, 12, ctrl.signal);
          evalsArr.push(String(ev.pawns));
        }
        const evalsStr = evalsArr.join(';');

        const clocksStr = history
          .map((m) => clockToSeconds(m.clockTime))
          .join(';');

        let tc = '600+0';
        if (pgnHeaders.TimeControl && pgnHeaders.TimeControl !== '-' && pgnHeaders.TimeControl !== '?') {
          tc = pgnHeaders.TimeControl.includes('+')
            ? pgnHeaders.TimeControl
            : `${pgnHeaders.TimeControl}+0`;
        }

        const headerEco = pgnHeaders.ECO?.trim();
        const eco = headerEco && headerEco !== '?'
          ? headerEco
          : (classifyEco(history.map((m) => m.san))?.eco ?? 'A00');

        const r = await fetch('/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            evals: evalsStr,
            clocks: clocksStr,
            time_control: tc,
            eco,
          }),
          signal: ctrl.signal,
        });

        if (!r.ok) {
          const detail = (await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`;
          throw new Error(detail);
        }
        const d = await r.json();
        if (ctrl.signal.aborted) return;
        setPredictedWhiteElo(Math.round(d.whiteElo));
        setPredictedBlackElo(Math.round(d.blackElo));
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        console.error('Prediction failed', e);
        
        // NEW: Tell the user exactly why the prediction failed!
        toast.error(`Prediction Failed: ${e.message}`);
        
      } finally {
        if (!ctrl.signal.aborted) setIsPredicting(false);
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [history, pgnHeaders]);

  // Share FEN to Clipboard
  const handleCopyFen = () => {
    navigator.clipboard.writeText(chess.fen());
    toast.success('Current position FEN copied to clipboard!');
  };

  const handleCopyPgn = () => {
    navigator.clipboard.writeText(chess.pgn());
    toast.success('Game PGN copied to clipboard!');
  };

  // Realtime engine evaluation via Stockfish WASM. White's POV.
  const [evaluation, setEvaluation] = useState<Evaluation>({ pawns: 0 });
  useEffect(() => {
    const ctrl = new AbortController();
    stockfish
      .streamEval(fen, (e) => {
        if (!ctrl.signal.aborted) setEvaluation(e);
      }, 12, ctrl.signal)
      .catch((e) => { if (e?.name !== 'AbortError') console.error('Eval failed', e); });
    return () => ctrl.abort();
  }, [fen]);
  const currentStats = { score: evaluation.pawns, mate: evaluation.mate };

  const getWhitePlayerDetails = () => {
    if (Object.keys(pgnHeaders).length > 0) {
      const name = pgnHeaders['White'];
      const elo = pgnHeaders['WhiteElo'];
      return { name: name || 'White', rating: elo && elo !== '?' ? elo : undefined };
    }
    return { name: 'White', rating: undefined };
  };

  const getBlackPlayerDetails = () => {
    if (Object.keys(pgnHeaders).length > 0) {
      const name = pgnHeaders['Black'];
      const elo = pgnHeaders['BlackElo'];
      return { name: name || 'Black', rating: elo && elo !== '?' ? elo : undefined };
    }
    return { name: 'Black', rating: undefined };
  };

  const opponentColor = playerColor === 'w' ? 'b' : 'w';

  const formatTime = (seconds: number | string) => {
    let totalSeconds = 0;

    if (typeof seconds === 'string') {
      const parts = seconds.split(':');
      if (parts.length === 3) {
        let h = parseInt(parts[0] || '0', 10);
        let m = parseInt(parts[1] || '0', 10);
        let s = parseFloat(parts[2] || '0');

        totalSeconds = h * 3600 + m * 60 + s;
        let displayMins = Math.floor(totalSeconds / 60);

        if (totalSeconds < 60) {
          return `${displayMins.toString().padStart(2, '0')}:${s.toFixed(1).padStart(3, '0')}`;
        } else {
          return `${displayMins.toString().padStart(2, '0')}:${Math.floor(s).toString().padStart(2, '0')}`;
        }
      }
      return seconds;
    }

    totalSeconds = Math.max(0, seconds as number);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;

    if (totalSeconds < 60) {
      return `00:${secs.toFixed(1).padStart(3, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${Math.floor(secs).toString().padStart(2, '0')}`;
  };

  const whitePlayer = getWhitePlayerDetails();
  const blackPlayer = getBlackPlayerDetails();

  // Extract static clocks from PGN history if present
  const getCurrentClocks = () => {
    if (Object.keys(pgnHeaders).length > 0) {
      let wTimeStr = '';
      let bTimeStr = '';
      for (let i = history.length - 1; i >= 0; i--) {
        const mv = history[i];
        if (mv.clockTime) {
          if (mv.color === 'w' && !wTimeStr) wTimeStr = mv.clockTime;
          if (mv.color === 'b' && !bTimeStr) bTimeStr = mv.clockTime;
        }
      }

      if (!wTimeStr || !bTimeStr) {
        let baseTimeSeconds = 600; // default to 10 minutes matches default whiteTime/blackTime
        if (pgnHeaders.TimeControl) {
          const tc = pgnHeaders.TimeControl.split('+')[0]; // e.g. "600+0" or "600"
          if (!isNaN(parseInt(tc))) {
            baseTimeSeconds = parseInt(tc);
          }
        }

        const h = Math.floor(baseTimeSeconds / 3600);
        const m = Math.floor((baseTimeSeconds % 3600) / 60);
        const s = baseTimeSeconds % 60;
        const baseTimeStr = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

        if (!wTimeStr) wTimeStr = baseTimeStr;
        if (!bTimeStr) bTimeStr = baseTimeStr;
      }
      return { white: wTimeStr, black: bTimeStr };
    }
    return null;
  };
  const pgnClocks = getCurrentClocks();

  // Resolve active timers based on side turn
  const whiteTimerValue = pgnClocks ? pgnClocks.white : whiteTime;
  const blackTimerValue = pgnClocks ? pgnClocks.black : blackTime;

  const isWhiteActive = !isGameOver && !isTimeOver && chess.turn() === 'w';
  const isBlackActive = !isGameOver && !isTimeOver && chess.turn() === 'b';

  // Detect live opening played in history
  const opening = detectOpening(history);

  // Live Elo dynamic win probability projector
  const calculateWinProbabilities = (score: number) => {
    const baseWhite = 38;
    const baseDraw = 30;
    const baseBlack = 32;

    const wShift = score * 15;
    const bShift = -score * 15;

    let whiteProb = Math.max(5, Math.min(90, baseWhite + wShift));
    let blackProb = Math.max(5, Math.min(90, baseBlack + bShift));
    let drawProb = Math.max(5, 100 - whiteProb - blackProb);

    const total = whiteProb + blackProb + drawProb;
    whiteProb = Math.round((whiteProb / total) * 100);
    blackProb = Math.round((blackProb / total) * 100);
    drawProb = 100 - whiteProb - blackProb;

    return { white: whiteProb, draw: drawProb, black: blackProb };
  };

  const probabilities = calculateWinProbabilities(currentStats.score);

  return (
    <TooltipProvider>
      <div className={`min-h-screen w-full flex flex-col items-center justify-start py-6 px-4 md:px-8 select-none transition-all duration-300 ${activeTheme.background} bg-zinc-50 dark:bg-zinc-950 font-sans`}>

        <header className="w-full max-w-6xl flex items-center justify-between mb-6 select-none">
          <h1 className="font-sans font-extrabold text-xl tracking-tight text-zinc-900 dark:text-zinc-50">
            light<span className="text-zinc-400 dark:text-zinc-500">Elo</span>
          </h1>
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            aria-label="Toggle dark mode"
            className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 shadow-sm active:scale-95 transition-all"
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </header>

        {/* Global Toaster message banner handles in-game alerts */}
        <Toaster position="bottom-right" richColors />

        {/* Primary Dashboard layout */}
        <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Main Column 1: Sidebar (cols 4) */}
          <div className="lg:col-span-4 flex flex-col gap-6 order-2 lg:order-2 lg:h-0 lg:min-h-full">

            {/* Live Performance & Opening Analysis Card */}
            <Card className="border-zinc-200 dark:border-zinc-800/80 shadow-sm overflow-hidden bg-white dark:bg-zinc-900 select-none rounded-2xl py-3 shrink-0">
              <CardContent className="px-5 py-3 flex flex-col gap-4">
                {/* 1. Elo ratings section */}
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <span className="font-sans font-bold text-zinc-400 dark:text-zinc-500 text-[10px] uppercase tracking-wider">
                      Predicted Elo Ratings
                    </span>
                  </div>

                  {/* Detailed Elo cards */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* White Elo card */}
                    <div className="bg-white dark:bg-zinc-900 p-3 text-center rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="font-sans font-semibold text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">White</span>
                        {!isPredicting && predictedWhiteElo && predictedWhiteElo >= 2500 && <span className="font-mono text-[9px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-md font-bold">GM</span>}
                      </div>
                      <div className="flex items-baseline justify-center gap-1 mt-1 h-7">
                        {isPredicting ? (
                          <ScramblingDigits />
                        ) : (
                          <span className="font-mono font-bold text-lg text-zinc-900 dark:text-zinc-50">{predictedWhiteElo ? predictedWhiteElo : '----'}</span>
                        )}
                      </div>
                    </div>

                    {/* Black Elo card */}
                    <div className="bg-zinc-900 dark:bg-zinc-950 p-3 text-center rounded-xl border border-zinc-800 dark:border-zinc-800 shadow-sm">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="font-sans font-semibold text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Black</span>
                        {!isPredicting && predictedBlackElo && predictedBlackElo >= 2500 && <span className="font-mono text-[9px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-md font-bold">GM</span>}
                      </div>
                      <div className="flex items-baseline justify-center gap-1 mt-1 h-7">
                        {isPredicting ? (
                          <ScramblingDigits onDark />
                        ) : (
                          <span className="font-mono font-bold text-lg text-white dark:text-zinc-50">{predictedBlackElo ? predictedBlackElo : '----'}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="font-sans text-[10px] leading-snug text-zinc-500 dark:text-zinc-400 mt-1">
                    Predictions are on the Lichess rating scale, which runs ~400 points higher than Chess.com.{' '}
                    <a
                      href="https://www.chessratingcomparison.com/graphs"
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold underline decoration-dotted underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                    >
                      Convert between scales
                    </a>
                    .
                  </p>
                </div>

                <div className="flex flex-col gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800/60 mt-1 min-h-[58px]">
                  <span className="font-sans font-bold text-zinc-400 dark:text-zinc-500 text-[10px] uppercase tracking-wider">
                    Opening
                  </span>
                  <span className="font-sans font-extrabold text-[15px] tracking-tight text-zinc-900 dark:text-zinc-50 animate-in fade-in duration-300">
                    {opening ? opening.name : 'Starting Position'}
                  </span>
                </div>

                {/* Horizontal Evaluation Bar */}
                {gameMode !== 'puzzle' && (
                  <div className="flex flex-col gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800/60 mt-1">
                    <span className="font-sans font-bold text-zinc-400 dark:text-zinc-500 text-[10px] uppercase tracking-wider">
                      Engine Evaluation
                    </span>
                    <div className="mt-1 h-7 w-full bg-zinc-800 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 flex overflow-hidden relative shadow-inner animate-in fade-in duration-500">
                      {/* Label for evaluation */}
                      <div className="absolute top-0 left-0 w-full h-full flex justify-between items-center px-4 pointer-events-none z-10 select-none">
                        <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-500 font-bold mix-blend-difference">W</span>
                        <div className="flex flex-1 justify-center items-center mix-blend-difference">
                          <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-500 font-bold">
                            {currentStats.mate !== undefined
                              ? (currentStats.mate < 0 ? `-M${Math.abs(currentStats.mate)}` : `M${currentStats.mate}`)
                              : `${currentStats.score > 0 ? '+' : ''}${currentStats.score.toFixed(1)}`}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-500 font-bold mix-blend-difference">B</span>
                      </div>
                      <div
                        className="bg-white dark:bg-zinc-200 h-full transition-all duration-700 ease-out"
                        style={{ width: `${Math.max(5, Math.min(95, 50 + (currentStats.score * 5)))}%` }}
                      />
                      <div className="bg-zinc-900 dark:bg-zinc-800 h-full flex-grow transition-all duration-500 ease-out relative">
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Match PGN Entry and Sandbox Commentary Combined */}
            <Card className="border-zinc-200 dark:border-zinc-800/80 shadow-sm animate-in slide-in-from-bottom-2 duration-300 flex flex-col flex-1 rounded-2xl py-3 min-h-0">
              <CardContent className="px-5 py-3 flex flex-col gap-4 select-none flex-grow overflow-hidden bg-white dark:bg-zinc-900 rounded-2xl min-h-0">
                {/* Metadata section removed per request */}
                <div className="flex justify-between items-center -mb-1 mt-1">
                  <p className="font-sans text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                    {isRawPgnMode ? "Raw PGN" : (history.length > 0 || redoStack.length > 0) ? "Moves" : "Input PGN"}
                  </p>
                  <div className="flex items-center gap-3">
                    {!(history.length > 0 || redoStack.length > 0) && (
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept=".pgn"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              const content = event.target?.result as string;
                              setPgnInputText(content);
                              parsePgnToState(content, true);
                            };
                            reader.readAsText(file);
                            e.target.value = '';
                          }}
                        />
                        <span className="flex flex-shrink-0 items-center gap-1.5 text-[9px] font-sans font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200/50 dark:border-zinc-700/50 transition-colors">
                          <Upload className="w-3 h-3" /> Upload
                        </span>
                      </label>
                    )}
                    {(history.length > 0 || redoStack.length > 0) && (
                      <button
                        onClick={() => setIsRawPgnMode(!isRawPgnMode)}
                        className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-800 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
                      >
                        {isRawPgnMode ? 'Show Moves' : 'Raw PGN'}
                      </button>
                    )}
                  </div>
                </div>

                {(!isRawPgnMode && (history.length > 0 || redoStack.length > 0)) ? (
                  <div className="flex flex-col gap-0.5 w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-1.5 flex-1 overflow-auto scroll-smooth select-none shadow-inner min-h-0 max-h-[300px] lg:max-h-none">
                    {(() => {
                      const fullHistory = [...history, ...[...redoStack].reverse()];
                      const currentMoveIndex = history.length - 1;
                      return Array.from({ length: Math.ceil(fullHistory.length / 2) }).map((_, idx) => {
                        const whiteMoveIndex = idx * 2;
                        const blackMoveIndex = idx * 2 + 1;
                        const whiteMove = fullHistory[whiteMoveIndex];
                        const blackMove = fullHistory[blackMoveIndex];
                        return (
                          <div key={idx} className={`grid grid-cols-[1.75rem_1fr_1fr] items-stretch gap-1 text-xs font-sans py-0.5 px-1 rounded-md ${idx % 2 === 0 ? 'bg-zinc-50 dark:bg-zinc-800/25' : 'bg-transparent'}`}>
                            <span className="self-center text-right pr-1.5 font-mono font-semibold select-none text-[10px] text-zinc-400 dark:text-zinc-600">{idx + 1}.</span>
                            <StyledMove san={whiteMove?.san} color="w" isActive={whiteMoveIndex === currentMoveIndex} onClick={() => handleJumpToMove(whiteMoveIndex)} />
                            <StyledMove san={blackMove?.san} color="b" isActive={blackMoveIndex === currentMoveIndex} onClick={() => handleJumpToMove(blackMoveIndex)} />
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 w-full flex-1">
                    <textarea
                      id="pgn-input"
                      placeholder="1. e4 e5..."
                      className={`w-full text-[10px] font-mono px-3 py-3 bg-white dark:bg-zinc-900 border rounded-xl focus:outline-none focus:ring-1 flex-1 resize-none select-text text-zinc-900 dark:text-zinc-100 shadow-inner leading-relaxed ${isPgnInvalid && pgnInputText.trim()
                          ? 'border-red-500 focus:ring-red-500 dark:border-red-500/50 dark:focus:ring-red-500/50'
                          : 'border-zinc-200 dark:border-zinc-800 focus:ring-zinc-400'
                        }`}
                      value={pgnInputText}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const file = e.dataTransfer.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const content = event.target?.result as string;
                          setPgnInputText(content);
                          parsePgnToState(content, true);
                        };
                        reader.readAsText(file);
                      }}
                      onChange={(e) => {
                        const parsedPgn = e.target.value;
                        const isPaste = Math.abs(parsedPgn.length - pgnInputText.length) > 10;
                        setPgnInputText(parsedPgn);

                        try {
                          if (!parsedPgn.trim()) {
                            setPredictedWhiteElo(null);
                            setPredictedBlackElo(null);
                            setPgnHeaders({});
                            // Clear the board if they clear the text
                            const resetChess = new Chess();
                            setChess(resetChess);
                            setFen(resetChess.fen());
                            setHistory([]);
                            return;
                          }

                          // Process changes via central function
                          parsePgnToState(parsedPgn, false);
                        } catch (err) {
                          // Invalid PGN mid-typing, ignore layout update until valid
                        }
                      }}
                      onBlur={() => {
                        if (chess && redoStack.length === 0) {
                          const movesOnly = chess.pgn().replace(/^\[[a-zA-Z]+\s+".*?"\]\s*\n?/gm, '').replace(/\{[^}]*\}/g, '').replace(/\s*\*$/, '').replace(/\s+/g, ' ').trim();
                          if (movesOnly) {
                            setPgnInputText(movesOnly);
                          }
                        }
                      }}
                    />
                    {isPgnInvalid && pgnInputText.trim() && (
                      <span className="text-[10px] font-sans font-medium text-red-500 dark:text-red-400 mt-0.5 ml-1 animate-in fade-in slide-in-from-top-1 duration-200">
                        {pgnErrorMsg || 'Invalid PGN format'}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex gap-1 w-full mt-2 justify-center">
                  <button
                    onClick={handleRewindAll}
                    disabled={history.length === 0}
                    className="flex-1 max-w-[60px] flex justify-center items-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 py-2.5 rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleUndoMove}
                    disabled={history.length === 0}
                    className="flex-1 max-w-[60px] flex justify-center items-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 py-2.5 rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleRedoMove}
                    disabled={redoStack.length === 0}
                    className="flex-1 max-w-[60px] flex justify-center items-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 py-2.5 rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleFastForward}
                    disabled={redoStack.length === 0}
                    className="flex-1 max-w-[60px] flex justify-center items-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 py-2.5 rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Quick aesthetics controls (moved below PGN) */}
            <div className="grid grid-cols-4 gap-2 w-full">
              <button
                onClick={handleResetBoard}
                className="col-span-1 p-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 shadow-sm active:scale-95 transition-all flex justify-center items-center gap-1.5 font-sans font-bold text-zinc-700 dark:text-zinc-300 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">Reset</span>
              </button>
              <button
                onClick={() => setIsFlipped(!isFlipped)}
                className="col-span-1 p-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 shadow-sm active:scale-95 transition-all flex justify-center items-center gap-1.5 font-sans font-bold text-zinc-700 dark:text-zinc-300 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Flip</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger className="col-span-1 border-none focus:outline-none focus:ring-0 outline-none">
                  <div className="p-2 w-full text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 shadow-sm active:scale-95 transition-all flex justify-center items-center gap-1.5 font-sans font-bold text-zinc-700 dark:text-zinc-300 cursor-pointer">
                    <Share2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Share</span>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 relative z-50 min-w-[120px]">
                  <DropdownMenuItem onClick={handleCopyFen} className="cursor-pointer py-2 text-xs font-semibold font-sans focus:bg-zinc-100 dark:focus:bg-zinc-800 transition-colors">
                    Export FEN
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCopyPgn} className="cursor-pointer py-2 text-xs font-semibold font-sans focus:bg-zinc-100 dark:focus:bg-zinc-800 transition-colors">
                    Export PGN
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <a
                href="https://github.com/hari3mo/lightElo"
                target="_blank"
                rel="noreferrer"
                className="col-span-1 p-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 shadow-sm active:scale-95 transition-all flex justify-center items-center gap-1.5 font-sans font-bold text-zinc-700 dark:text-zinc-300 cursor-pointer"
              >
                <Github className="w-4 h-4" />
                <span className="hidden sm:inline">GitHub</span>
              </a>
            </div>
          </div>

          {/* Main Column 2: Chessboard Area (cols 8) */}
          <div className="lg:col-span-8 flex flex-col gap-5 order-1 lg:order-1">

            {/* Players Area: White on the Left, Black on the Right */}
            <div className="grid grid-cols-2 gap-3 w-full animate-in fade-in duration-300">
              {/* White Player Bar */}
              <div className={`flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-300 relative overflow-hidden border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 shadow-sm ${isWhiteActive ? 'bg-zinc-50/50 dark:bg-zinc-800/20' : ''
                }`}>
                <div className="absolute inset-0 bg-gradient-to-r from-zinc-50/50 to-transparent dark:from-zinc-900/50 dark:to-transparent pointer-events-none opacity-40" />
                <div className="flex items-center gap-3 relative z-10 min-w-0">
                  <div className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center font-bold text-sm shadow-sm border border-zinc-200 bg-white text-zinc-900">
                    <User className="w-4.5 h-4.5 text-zinc-800" />
                  </div>
                  <div className="min-w-0 flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight truncate">
                        {whitePlayer.name}
                      </span>
                      {whitePlayer.rating && (
                        <span className="text-[9px] bg-zinc-100/80 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-450 font-semibold px-1.5 py-0.5 rounded font-mono shadow-sm shrink-0 border border-zinc-250/20 dark:border-zinc-700/20">
                          {whitePlayer.rating}
                        </span>
                      )}
                      {isWhiteActive && (
                        <span className="h-2 w-2 rounded-full bg-green-500 shrink-0 shadow-sm shadow-green-550/10"></span>
                      )}
                    </div>
                    <div className="flex items-center mt-0.5 min-h-[16px] flex-wrap">
                      <PlayerCapturedBar
                        capturedPieces={capturedByWhite}
                        capturedPiecesColor="b"
                        advantage={isWhiteActive ? whiteAdvantage : 0}
                      />
                    </div>
                  </div>
                </div>

                {/* Countdown Chess Clock display */}
                <div className={`rounded-xl border px-3 py-1.5 shadow-sm transition-all duration-300 relative z-10 shrink-0 ${isWhiteActive
                    ? 'bg-zinc-950 dark:bg-zinc-50 border-zinc-950 dark:border-white text-white dark:text-zinc-950 shadow-sm font-extrabold'
                    : 'bg-zinc-50/50 dark:bg-zinc-900/40 border-zinc-100 dark:border-zinc-800 text-zinc-400 dark:text-zinc-650'
                  }`}>
                  <p className="font-mono text-xs sm:text-base font-bold tabular-nums tracking-tight">
                    {formatTime(whiteTimerValue)}
                  </p>
                </div>
              </div>

              {/* Black Player Bar */}
              <div className={`flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-300 relative overflow-hidden border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 shadow-sm ${isBlackActive ? 'bg-zinc-50/50 dark:bg-zinc-800/20' : ''
                }`}>
                <div className="absolute inset-0 bg-gradient-to-r from-zinc-50/50 to-transparent dark:from-zinc-900/50 dark:to-transparent pointer-events-none opacity-40" />
                <div className="flex items-center gap-3 relative z-10 min-w-0">
                  <div className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center font-bold text-sm shadow-sm border border-zinc-900 dark:border-zinc-800 bg-zinc-950 text-zinc-100">
                    <User className="w-4.5 h-4.5 text-zinc-100" />
                  </div>
                  <div className="min-w-0 flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight truncate">
                        {blackPlayer.name}
                      </span>
                      {blackPlayer.rating && (
                        <span className="text-[9px] bg-zinc-100/80 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-450 font-semibold px-1.5 py-0.5 rounded font-mono shadow-sm shrink-0 border border-zinc-250/20 dark:border-zinc-700/20">
                          {blackPlayer.rating}
                        </span>
                      )}
                      {isBlackActive && (
                        <span className="h-2 w-2 rounded-full bg-green-500 shrink-0 shadow-sm shadow-green-550/10"></span>
                      )}
                    </div>
                    <div className="flex items-center mt-0.5 min-h-[16px] flex-wrap">
                      <PlayerCapturedBar
                        capturedPieces={capturedByBlack}
                        capturedPiecesColor="w"
                        advantage={isBlackActive ? blackAdvantage : 0}
                      />
                    </div>
                  </div>
                </div>

                {/* Countdown Chess Clock display */}
                <div className={`rounded-xl border px-3 py-1.5 shadow-sm transition-all duration-300 relative z-10 shrink-0 ${isBlackActive
                    ? 'bg-zinc-950 dark:bg-zinc-50 border-zinc-950 dark:border-white text-white dark:text-zinc-950 shadow-sm font-extrabold'
                    : 'bg-zinc-50/50 dark:bg-zinc-900/40 border-zinc-100 dark:border-zinc-800 text-zinc-400 dark:text-zinc-650'
                  }`}>
                  <p className="font-mono text-xs sm:text-base font-bold tabular-nums tracking-tight">
                    {formatTime(blackTimerValue)}
                  </p>
                </div>
              </div>
            </div>

            {/* Chess Board wrapper holding centered chess boards and pieces */}
            <div className="flex gap-4 items-stretch relative">
              <div className="flex-1 min-w-0 bg-white dark:bg-zinc-900 p-2 sm:p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 shadow-sm">
                <ChessBoard
                  fen={fen}
                  onMove={executePhysicalMove}
                  activeTheme={activeTheme}
                  interactive={!isGameOver && !aiThinking && !isTimeOver}
                  showCoordinates={showCoordinates}
                  isFlipped={isFlipped}
                  botDifficulty={aiDifficulty}
                  gameMode={gameMode}
                  selectedSquare={selectedSquare}
                  setSelectedSquare={setSelectedSquare}
                  highlightedMoves={highlightedMoves}
                  setHighlightedMoves={setHighlightedMoves}
                  lastMove={lastMove}
                  kingInCheckSq={kingInCheckSq}
                />
              </div>
            </div>

          </div>

        </main>
      </div>
    </TooltipProvider>
  );
}