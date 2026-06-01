import { ChessPuzzle } from '../types';

export const CHESS_PUZZLES: ChessPuzzle[] = [
  {
    id: 'back_rank_1',
    title: 'Back Rank Deflection',
    description: 'Black\'s back rank is exposed and undefended. Find the tactical rook infiltration that forces checkmate.',
    initialFen: '5rk1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1',
    solution: ['e1e8', 'f8e8'], // White rook to e8, then black rook must capture it
    sideToPlay: 'w',
    hint: 'Look for standard ranks or files that are cut off by pawns. Force the rook onto the back row.',
    successMessage: 'Brilliant! The Black King is trapped behind its own defensive shield of pawns. This is a classic Back-Rank Mate.'
  },
  {
    id: 'smothered_1',
    title: 'Smothered Mate In One',
    description: 'The black king is completely surrounded and suffocating under its own army. Deliver a fatal blow.',
    initialFen: '6rk/5ppp/8/4N3/8/8/6PP/6K1 w - - 0 1',
    solution: ['e5f7'],
    sideToPlay: 'w',
    hint: 'Black\'s king is boxed in. Notice the knight\'s unique ability to jump over walls and attack the corner.',
    successMessage: 'Outstanding! Nf7# delivers a spectacular Smothered Checkmate. The Black King is completely choked by its own guards.'
  },
  {
    id: 'philidor_legacy',
    title: 'Anastasia\'s Mate',
    description: 'Use the knight to restrict the king, then open the files to deliver standard heavy officer checkmate.',
    initialFen: '5rk1/5ppp/4N3/8/8/8/5PPP/3R2K1 w - - 0 1',
    solution: ['e6f8', 'g8f8'],
    sideToPlay: 'w',
    hint: 'Remove the key defender guarding the back doors.',
    successMessage: 'Excellent job. Eliminating the enemy rook breaks Black\'s core defensive structure.'
  }
];
