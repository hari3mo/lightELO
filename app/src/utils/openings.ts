export interface ChessOpening {
  name: string;
  description: string;
  moves: string[];
}

export const POPULAR_OPENINGS: ChessOpening[] = [
  {
    name: "Ruy Lopez",
    description: "One of the oldest, deepest, and most prestigious chess openings. White develops the bishop to b5 to pressure the knight defending Black's central pawn on e5.",
    moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"]
  },
  {
    name: "Italian Game",
    description: "A classical and aggressive opening. White develops the bishop to c4, aiming directly at Black's weakest spot: the f7 pawn close to the king.",
    moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"]
  },
  {
    name: "Scotch Game",
    description: "An energetic and straightforward opening. White immediately strikes the center with d4, inviting tactical trades and open play.",
    moves: ["e2e4", "e7e5", "g1f3", "b8c6", "d2d4"]
  },
  {
    name: "Petrov's Defense",
    description: "A highly solid, symmetrical counter-attack. Black chooses to counter-attack White's e4 pawn instead of defending their own e5 pawn.",
    moves: ["e2e4", "e7e5", "g1f3", "g8f6"]
  },
  {
    name: "Philidor Defense",
    description: "A solid and cautious opening. Black reinforces the e5 pawn with d6, maintaining a safe, though somewhat passive and cramped posture.",
    moves: ["e2e4", "e7e5", "g1f3", "d7d6"]
  },
  {
    name: "Sicilian Defense",
    description: "The most popular, sharpest, and highest-scoring response to e4. By fighting for d4 with the c-pawn, Black initiates a complex asymmetrical battle.",
    moves: ["e2e4", "c7c5"]
  },
  {
    name: "French Defense",
    description: "A resilient, structural defense. Black blocks the light-square bishop but secures a strong pawn chain, preparing to blow up White's center later.",
    moves: ["e2e4", "e7e6"]
  },
  {
    name: "Caro-Kann Defense",
    description: "An exceptionally solid and safe defense. Black prepares to push d5 with support, aiming for clean pawn structures and a favorable endgame.",
    moves: ["e2e4", "c7c6"]
  },
  {
    name: "Modern Defense",
    description: "A hypermodern defense. Black allows White to occupy the center with pawns, planning to attack and piece-pressure it from the flanks.",
    moves: ["e2e4", "g7g6"]
  },
  {
    name: "Pirc Defense",
    description: "A hypermodern counterpart to the King's Indian. Black delays central pawn moves in favor of quick development, looking to counterpunch.",
    moves: ["e2e4", "d7d6"]
  },
  {
    name: "Alekhine's Defense",
    description: "A provocative, psychological defense. Black lures White's pawns forward into over-expansion, hoping to make them targets later.",
    moves: ["e2e4", "g8f6"]
  },
  {
    name: "Queen's Gambit Declined",
    description: "The height of classical sound chess. Black declines the gambit pawn at c4 to construct an unshakeable central wedge.",
    moves: ["d2d4", "d7d5", "c2c4", "e7e6"]
  },
  {
    name: "Slav Defense",
    description: "A brilliant, rock-solid response to the Queen's Gambit. Black supports the d5 pawn with c6, keeping the light-square bishop free to develop.",
    moves: ["d2d4", "d7d5", "c2c4", "c7c6"]
  },
  {
    name: "Queen's Gambit",
    description: "White offers a side pawn to lure Black's d-pawn away, aiming to seize total central control and open development lines.",
    moves: ["d2d4", "d7d5", "c2c4"]
  },
  {
    name: "King's Indian Defense",
    description: "A highly dynamic hypermodern defense. Black gives up immediate center space, intending a powerful kingside pawn-storm in the middlegame.",
    moves: ["d2d4", "g8f6", "c2c4", "g7g6"]
  },
  {
    name: "Nimzo-Indian Defense",
    description: "A highly respected and flexible defense. Black pins White's knight on c3 to clamp down on the vital e4 square.",
    moves: ["d2d4", "g8f6", "c2c4", "e7e6"]
  },
  {
    name: "Dutch Defense",
    description: "An aggressive flank response. Black fights for e4 control using the f-pawn, creating unbalanced, high-stakes tactical structures.",
    moves: ["d2d4", "f7f5"]
  },
  {
    name: "Queen's Pawn Game",
    description: "A solid, strategic start aiming for steady development, strong squares control, and robust central protection.",
    moves: ["d2d4", "d7d5"]
  },
  {
    name: "Indian Defense",
    description: "A hypermodern response to the queen's pawn. Black controls e4 with pieces rather than pawns, keeping layout options flexible.",
    moves: ["d2d4", "g8f6"]
  },
  {
    name: "King's Pawn Game",
    description: "The classical open starting move. White stakes an immediate claim in the center, opens up the queen and light-squared bishop.",
    moves: ["e2e4", "e7e5"]
  },
  {
    name: "Reti Opening",
    description: "A flexible hypermodern flank opening. White develops the knight first, keeping black guessing about vertical pawn commitments.",
    moves: ["g1f3", "d7d5"]
  },
  {
    name: "English Opening",
    description: "White stakes a claim in the center with a flank pawn (c4), controlling the critical d5 square and steering games into positional depth.",
    moves: ["c2c4"]
  },
  {
    name: "Bird's Opening",
    description: "An aggressive flank choice. White pushes f4 immediately to pressure e5 and build a kingside presence.",
    moves: ["f2f4"]
  },
  {
    name: "Nimzowitsch-Larsen Attack",
    description: "An elegant flank system. White prepares to play b3 and fianchetto the dark-square bishop to control the diagonal e4-a8.",
    moves: ["b3"]
  },
  {
    name: "King's Pawn Game",
    description: "The most popular opening move in chess. White stakes a claim in the center and prepares quick bishop and queen activation.",
    moves: ["e2e4"]
  },
  {
    name: "Queen's Pawn Game",
    description: "A highly strategic opening move. White controls the e5 square, preparing for structured, positional, and queen-side campaigns.",
    moves: ["d2d4"]
  }
];

/**
 * Detect the deepest matching opening from the current game's move coordinates history.
 */
export function detectOpening(historyMoves: { from: string; to: string }[]): { name: string; description: string } | null {
  if (historyMoves.length === 0) return null;

  const currentCoords = historyMoves.map(m => `${m.from}${m.to}`);
  
  let deepestMatch: ChessOpening | null = null;
  let maxMatchedMoves = 0;

  for (const opening of POPULAR_OPENINGS) {
    // Check if the opening moves are a prefix of the played history
    if (opening.moves.length <= currentCoords.length) {
      let isMatch = true;
      for (let i = 0; i < opening.moves.length; i++) {
        if (opening.moves[i] !== currentCoords[i]) {
          isMatch = false;
          break;
        }
      }
      
      if (isMatch && opening.moves.length > maxMatchedMoves) {
        deepestMatch = opening;
        maxMatchedMoves = opening.moves.length;
      }
    }
  }

  return deepestMatch ? { name: deepestMatch.name, description: deepestMatch.description } : null;
}

export interface EcoEntry {
  /** Representative ECO code (the first code of the range it covers). */
  eco: string;
  name: string;
  /** SAN move sequence that defines the opening. */
  moves: string[];
}

// ECO classification table keyed by the defining SAN move sequence. A game is
// classified by the longest sequence here that is a prefix of its moves.
export const ECO_TABLE: EcoEntry[] = [
  { eco: 'A00', name: 'Polish (Sokolsky) Opening', moves: ['b4'] },
  { eco: 'A01', name: 'Nimzovich-Larsen Attack', moves: ['b3'] },
  { eco: 'A02', name: "Bird's Opening", moves: ['f4'] },
  { eco: 'A04', name: 'Reti Opening', moves: ['Nf3'] },
  { eco: 'A10', name: 'English Opening', moves: ['c4'] },
  { eco: 'A40', name: "Queen's Pawn", moves: ['d4'] },
  { eco: 'A42', name: 'Modern Defence, Averbakh System', moves: ['d4', 'd6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4'] },
  { eco: 'A43', name: 'Old Benoni Defence', moves: ['d4', 'c5'] },
  { eco: 'A45', name: "Queen's Pawn Game", moves: ['d4', 'Nf6'] },
  { eco: 'A47', name: "Queen's Indian Defence", moves: ['d4', 'Nf6', 'Nf3', 'b6'] },
  { eco: 'A48', name: "King's Indian, East Indian Defence", moves: ['d4', 'Nf6', 'Nf3', 'g6'] },
  { eco: 'A50', name: "Queen's Pawn Game", moves: ['d4', 'Nf6', 'c4'] },
  { eco: 'A51', name: 'Budapest Defence', moves: ['d4', 'Nf6', 'c4', 'e5'] },
  { eco: 'A53', name: 'Old Indian Defence', moves: ['d4', 'Nf6', 'c4', 'd6'] },
  { eco: 'A56', name: 'Benoni Defence', moves: ['d4', 'Nf6', 'c4', 'c5'] },
  { eco: 'A57', name: 'Benko Gambit', moves: ['d4', 'Nf6', 'c4', 'c5', 'd5', 'b5'] },
  { eco: 'A60', name: 'Benoni Defence', moves: ['d4', 'Nf6', 'c4', 'c5', 'd5', 'e6'] },
  { eco: 'A80', name: 'Dutch', moves: ['d4', 'f5'] },
  { eco: 'B00', name: "King's Pawn Opening", moves: ['e4'] },
  { eco: 'B01', name: 'Scandinavian (Centre Counter) Defence', moves: ['e4', 'd5'] },
  { eco: 'B02', name: "Alekhine's Defence", moves: ['e4', 'Nf6'] },
  { eco: 'B06', name: 'Robatsch (Modern) Defence', moves: ['e4', 'g6'] },
  { eco: 'B07', name: 'Pirc Defence', moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3'] },
  { eco: 'B10', name: 'Caro-Kann Defence', moves: ['e4', 'c6'] },
  { eco: 'B20', name: 'Sicilian Defence', moves: ['e4', 'c5'] },
  { eco: 'C00', name: 'French Defence', moves: ['e4', 'e6'] },
  { eco: 'C20', name: "King's Pawn Game", moves: ['e4', 'e5'] },
  { eco: 'C21', name: 'Centre Game', moves: ['e4', 'e5', 'd4', 'exd4'] },
  { eco: 'C23', name: "Bishop's Opening", moves: ['e4', 'e5', 'Bc4'] },
  { eco: 'C25', name: 'Vienna Game', moves: ['e4', 'e5', 'Nc3'] },
  { eco: 'C30', name: "King's Gambit", moves: ['e4', 'e5', 'f4'] },
  { eco: 'C40', name: "King's Knight Opening", moves: ['e4', 'e5', 'Nf3'] },
  { eco: 'C41', name: "Philidor's Defence", moves: ['e4', 'e5', 'Nf3', 'd6'] },
  { eco: 'C42', name: "Petrov's Defence", moves: ['e4', 'e5', 'Nf3', 'Nf6'] },
  { eco: 'C44', name: "King's Pawn Game", moves: ['e4', 'e5', 'Nf3', 'Nc6'] },
  { eco: 'C45', name: 'Scotch Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4'] },
  { eco: 'C46', name: 'Three Knights Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3'] },
  { eco: 'C47', name: 'Four Knights, Scotch Variation', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6', 'd4'] },
  { eco: 'C50', name: 'Italian Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'] },
  { eco: 'C51', name: 'Evans Gambit', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4'] },
  { eco: 'C53', name: 'Giuoco Piano', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3'] },
  { eco: 'C55', name: 'Two Knights Defence', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'] },
  { eco: 'C60', name: 'Ruy Lopez (Spanish Opening)', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] },
  { eco: 'D00', name: "Queen's Pawn Game", moves: ['d4', 'd5'] },
  { eco: 'D01', name: 'Richter-Veresov Attack', moves: ['d4', 'd5', 'Nc3', 'Nf6', 'Bg5'] },
  { eco: 'D02', name: "Queen's Pawn Game", moves: ['d4', 'd5', 'Nf3'] },
  { eco: 'D03', name: 'Torre Attack (Tartakower Variation)', moves: ['d4', 'd5', 'Nf3', 'Nf6', 'Bg5'] },
  { eco: 'D04', name: "Queen's Pawn Game", moves: ['d4', 'd5', 'Nf3', 'Nf6', 'e3'] },
  { eco: 'D06', name: "Queen's Gambit", moves: ['d4', 'd5', 'c4'] },
  { eco: 'D07', name: "Queen's Gambit Declined, Chigorin Defence", moves: ['d4', 'd5', 'c4', 'Nc6'] },
  { eco: 'D10', name: "Queen's Gambit Declined Slav Defence", moves: ['d4', 'd5', 'c4', 'c6'] },
  { eco: 'D16', name: "Queen's Gambit Declined Slav Accepted, Alapin Variation", moves: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'dxc4', 'a4'] },
  { eco: 'D17', name: "Queen's Gambit Declined Slav, Czech Defence", moves: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'dxc4', 'a4', 'Bf5'] },
  { eco: 'D20', name: "Queen's Gambit Accepted", moves: ['d4', 'd5', 'c4', 'dxc4'] },
  { eco: 'D30', name: "Queen's Gambit Declined", moves: ['d4', 'd5', 'c4', 'e6'] },
  { eco: 'D43', name: "Queen's Gambit Declined Semi-Slav", moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Nf3', 'c6'] },
  { eco: 'D50', name: "Queen's Gambit Declined, 4.Bg5", moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5'] },
  { eco: 'D70', name: 'Neo-Gruenfeld Defence', moves: ['d4', 'Nf6', 'c4', 'g6', 'f3', 'd5'] },
  { eco: 'D80', name: 'Gruenfeld Defence', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5'] },
  { eco: 'E00', name: "Queen's Pawn Game", moves: ['d4', 'Nf6', 'c4', 'e6'] },
  { eco: 'E01', name: 'Catalan, Closed', moves: ['d4', 'Nf6', 'c4', 'e6', 'g3', 'd5', 'Bg2'] },
  { eco: 'E10', name: "Queen's Pawn Game", moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3'] },
  { eco: 'E11', name: 'Bogo-Indian Defence', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'Bb4+'] },
  { eco: 'E12', name: "Queen's Indian Defence", moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6'] },
  { eco: 'E20', name: 'Nimzo-Indian Defence', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'] },
  { eco: 'E60', name: "King's Indian Defence", moves: ['d4', 'Nf6', 'c4', 'g6'] },
];

const stripSan = (san: string): string => san.replace(/[+#!?]/g, '');

/**
 * Classify a game's ECO code from its SAN move list using ECO_TABLE.
 * Returns the entry whose defining moves are the longest prefix of the game,
 * or null if no entry matches (e.g. an irregular first move).
 */
export function classifyEco(sanMoves: string[]): { eco: string; name: string } | null {
  const moves = sanMoves.map(stripSan);
  let best: EcoEntry | null = null;

  for (const entry of ECO_TABLE) {
    if (entry.moves.length > moves.length) continue;
    let isPrefix = true;
    for (let i = 0; i < entry.moves.length; i++) {
      if (stripSan(entry.moves[i]) !== moves[i]) {
        isPrefix = false;
        break;
      }
    }
    if (isPrefix && (best === null || entry.moves.length > best.moves.length)) {
      best = entry;
    }
  }

  return best ? { eco: best.eco, name: best.name } : null;
}
