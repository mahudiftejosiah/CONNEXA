export type ChessColor = "w" | "b";
export type ChessPieceType = "k" | "q" | "r" | "b" | "n" | "p";
export type ChessPiece = { t: ChessPieceType; c: ChessColor };

export type ChessState = {
  board: (ChessPiece | null)[];
  turn: ChessColor;
  castling: { w: { k: boolean; q: boolean }; b: { k: boolean; q: boolean } };
  ep: number | null;
  halfmove: number;
  history: string[];
  result: "ongoing" | "checkmate" | "stalemate" | "draw";
  winner: ChessColor | null;
  check: boolean;
  lastMove: { from: number; to: number } | null;
};

type Board = (ChessPiece | null)[];
type Rights = ChessState["castling"];

const FILES = "abcdefgh";
const BACK: ChessPieceType[] = ["r", "b", "n", "q", "k", "b", "n", "r"];
const KNIGHT: number[][] = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const DIAG: number[][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTH: number[][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const AHEAD: number[][] = [...DIAG, ...ORTH];

const row = (i: number) => i >> 3;
const col = (i: number) => i & 7;
const at = (r: number, c: number) => r * 8 + c;
const onBoard = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const other = (c: ChessColor): ChessColor => (c === "w" ? "b" : "w");
const is = (p: ChessPiece | null, t: ChessPieceType, c: ChessColor) => !!p && p.t === t && p.c === c;
const sqName = (i: number) => `${FILES[col(i)]}${8 - row(i)}`;
const kingHome = (c: ChessColor) => (c === "w" ? 60 : 4);
const CORNERS: [number, ChessColor, "k" | "q"][] = [
  [63, "w", "k"], [56, "w", "q"], [7, "b", "k"], [0, "b", "q"],
];
const PROMOTABLE: ChessPieceType[] = ["q", "r", "b", "n"];
const promoType = (t?: ChessPieceType): ChessPieceType => (t && PROMOTABLE.includes(t) ? t : "q");

export function initialChess(): ChessState {
  const board: Board = new Array(64).fill(null);
  for (let c = 0; c < 8; c++) {
    board[at(0, c)] = { t: BACK[c], c: "b" };
    board[at(1, c)] = { t: "p", c: "b" };
    board[at(6, c)] = { t: "p", c: "w" };
    board[at(7, c)] = { t: BACK[c], c: "w" };
  }
  return {
    board,
    turn: "w",
    castling: { w: { k: true, q: true }, b: { k: true, q: true } },
    ep: null,
    halfmove: 0,
    history: [],
    result: "ongoing",
    winner: null,
    check: false,
    lastMove: null,
  };
}

function kingSquare(board: Board, color: ChessColor): number {
  for (let i = 0; i < 64; i++) if (is(board[i], "k", color)) return i;
  return -1;
}

function attacked(board: Board, sq: number, by: ChessColor): boolean {
  const r = row(sq), c = col(sq);
  const pr = by === "w" ? r + 1 : r - 1;
  for (const dc of [-1, 1]) if (onBoard(pr, c + dc) && is(board[at(pr, c + dc)], "p", by)) return true;
  for (const [dr, dc] of KNIGHT) if (onBoard(r + dr, c + dc) && is(board[at(r + dr, c + dc)], "n", by)) return true;
  for (const [dr, dc] of AHEAD) if (onBoard(r + dr, c + dc) && is(board[at(r + dr, c + dc)], "k", by)) return true;
  for (const [dr, dc] of DIAG) {
    let rr = r + dr, cc = c + dc;
    while (onBoard(rr, cc)) {
      const p = board[at(rr, cc)];
      if (p) {
        if (p.c === by && (p.t === "b" || p.t === "q")) return true;
        break;
      }
      rr += dr; cc += dc;
    }
  }
  for (const [dr, dc] of ORTH) {
    let rr = r + dr, cc = c + dc;
    while (onBoard(rr, cc)) {
      const p = board[at(rr, cc)];
      if (p) {
        if (p.c === by && (p.t === "r" || p.t === "q")) return true;
        break;
      }
      rr += dr; cc += dc;
    }
  }
  return false;
}

function pseudoTargets(board: Board, from: number, ep: number | null, castling: Rights): number[] {
  const p = board[from];
  if (!p) return [];
  const r = row(from), c = col(from);
  const out: number[] = [];
  const step = (dr: number, dc: number) => {
    if (!onBoard(r + dr, c + dc)) return;
    const q = board[at(r + dr, c + dc)];
    if (!q || q.c !== p.c) out.push(at(r + dr, c + dc));
  };

  if (p.t === "p") {
    const dir = p.c === "w" ? -1 : 1;
    if (onBoard(r + dir, c) && !board[at(r + dir, c)]) {
      out.push(at(r + dir, c));
      if (r === (p.c === "w" ? 6 : 1) && !board[at(r + 2 * dir, c)]) out.push(at(r + 2 * dir, c));
    }
    for (const dc of [-1, 1]) {
      if (!onBoard(r + dir, c + dc)) continue;
      const sq = at(r + dir, c + dc);
      if (board[sq] && board[sq]!.c !== p.c) out.push(sq);
      else if (!board[sq] && sq === ep) out.push(sq);
    }
    return out;
  }

  if (p.t === "n") {
    for (const [dr, dc] of KNIGHT) step(dr, dc);
    return out;
  }

  if (p.t === "k") {
    for (const [dr, dc] of AHEAD) step(dr, dc);
    const home = kingHome(p.c);
    if (from === home) {
      const rival = other(p.c);
      const kRook = at(row(home), 7), qRook = at(row(home), 0);
      const pathClear = (sq: number) => !board[sq];
      if (
        castling[p.c].k &&
        is(board[kRook], "r", p.c) &&
        pathClear(home + 1) && pathClear(home + 2) &&
        !attacked(board, home, rival) && !attacked(board, home + 1, rival) && !attacked(board, home + 2, rival)
      ) out.push(home + 2);
      // b1/b8 only has to be empty, not safe: the king never steps on it.
      if (
        castling[p.c].q &&
        is(board[qRook], "r", p.c) &&
        pathClear(home - 1) && pathClear(home - 2) && pathClear(home - 3) &&
        !attacked(board, home, rival) && !attacked(board, home - 2, rival) && !attacked(board, home - 3, rival)
      ) out.push(home - 2);
    }
    return out;
  }

  const dirs = p.t === "b" ? DIAG : p.t === "r" ? ORTH : AHEAD;
  for (const [dr, dc] of dirs) {
    let rr = r + dr, cc = c + dc;
    while (onBoard(rr, cc)) {
      const q = board[at(rr, cc)];
      if (!q) { out.push(at(rr, cc)); rr += dr; cc += dc; continue; }
      if (q.c !== p.c) out.push(at(rr, cc));
      break;
    }
  }
  return out;
}

function movePieces(board: Board, from: number, to: number, ep: number | null, promo?: ChessPieceType): Board {
  const nb = board.slice();
  const p = nb[from]!;
  nb[from] = null;
  if (p.t === "p" && to === ep && col(from) !== col(to)) nb[to + (p.c === "w" ? 8 : -8)] = null;
  nb[to] = p.t === "p" && (row(to) === 0 || row(to) === 7) ? { t: promoType(promo), c: p.c } : p;
  if (p.t === "k" && from === kingHome(p.c) && Math.abs(col(to) - col(from)) === 2) {
    const home = kingHome(p.c);
    if (col(to) === 6) { nb[home + 1] = nb[home + 3]; nb[home + 3] = null; }
    else { nb[home - 1] = nb[home - 4]; nb[home - 4] = null; }
  }
  return nb;
}

function isLegal(board: Board, from: number, to: number, ep: number | null, turn: ChessColor): boolean {
  const nb = movePieces(board, from, to, ep);
  const k = kingSquare(nb, turn);
  return k < 0 || !attacked(nb, k, other(turn));
}

export function legalMovesFrom(s: ChessState, from: number): number[] {
  if (s.result !== "ongoing" || from < 0 || from > 63) return [];
  const p = s.board[from];
  if (!p || p.c !== s.turn) return [];
  return pseudoTargets(s.board, from, s.ep, s.castling).filter((to) => isLegal(s.board, from, to, s.ep, s.turn));
}

export function allLegalTargets(s: ChessState): Record<number, number[]> {
  const out: Record<number, number[]> = {};
  if (s.result !== "ongoing") return out;
  for (let from = 0; from < 64; from++) {
    const moves = legalMovesFrom(s, from);
    if (moves.length) out[from] = moves;
  }
  return out;
}

function hasAnyLegalMove(board: Board, turn: ChessColor, ep: number | null, castling: Rights): boolean {
  for (let from = 0; from < 64; from++) {
    if (board[from]?.c !== turn) continue;
    if (pseudoTargets(board, from, ep, castling).some((to) => isLegal(board, from, to, ep, turn))) return true;
  }
  return false;
}

function insufficientMaterial(board: Board): boolean {
  let minors = 0;
  for (const p of board) {
    if (!p) continue;
    if (p.t === "p" || p.t === "r" || p.t === "q") return false;
    if (p.t === "b" || p.t === "n") minors++;
  }
  return minors <= 1;
}

function rivalsReaching(s: ChessState, from: number, to: number): number[] {
  const p = s.board[from]!;
  const out: number[] = [];
  for (let sq = 0; sq < 64; sq++) {
    if (sq === from) continue;
    const q = s.board[sq];
    if (q && q.t === p.t && q.c === p.c && legalMovesFrom(s, sq).includes(to)) out.push(sq);
  }
  return out;
}

function sanFor(s: ChessState, from: number, to: number, promo: ChessPieceType | undefined, suffix: string): string {
  const p = s.board[from]!;
  const home = kingHome(p.c);
  if (p.t === "k" && from === home && Math.abs(col(to) - 4) === 2) {
    return (col(to) === 6 ? "O-O" : "O-O-O") + suffix;
  }
  const capture = !!s.board[to] || (p.t === "p" && s.ep === to && col(from) !== col(to));
  let san = "";
  if (p.t === "p") {
    if (capture) san += FILES[col(from)] + "x";
    san += sqName(to);
    if (promo) san += "=" + promo.toUpperCase();
  } else {
    san += p.t.toUpperCase();
    const rivals = rivalsReaching(s, from, to);
    if (rivals.length) {
      const fileFree = rivals.every((f) => col(f) !== col(from));
      const rankFree = rivals.every((f) => row(f) !== row(from));
      if (fileFree) san += FILES[col(from)];
      else if (rankFree) san += `${8 - row(from)}`;
      else san += sqName(from);
    }
    san += capture ? "x" + sqName(to) : sqName(to);
  }
  return san + suffix;
}

export function applyMove(s: ChessState, from: number, to: number, promo?: ChessPieceType): ChessState {
  if (from < 0 || from > 63 || to < 0 || to > 63) return s;
  if (!legalMovesFrom(s, from).includes(to)) return s;

  const piece = s.board[from]!;
  const mover = s.turn;
  const rival = other(mover);
  const epCapture = piece.t === "p" && to === s.ep && col(from) !== col(to);
  const captured = s.board[to] ?? (epCapture ? s.board[to + (mover === "w" ? 8 : -8)] : null);
  const promotion = piece.t === "p" && (row(to) === 0 || row(to) === 7) ? promoType(promo) : undefined;

  const board = movePieces(s.board, from, to, s.ep, promotion);

  const castling: Rights = { w: { ...s.castling.w }, b: { ...s.castling.b } };
  if (piece.t === "k") { castling[mover].k = false; castling[mover].q = false; }
  for (const [sq, color, side] of CORNERS) {
    if (from === sq || to === sq) castling[color][side] = false;
  }

  const ep = piece.t === "p" && Math.abs(row(from) - row(to)) === 2 ? to + (mover === "w" ? 8 : -8) : null;
  const halfmove = captured || piece.t === "p" ? 0 : s.halfmove + 1;

  const rivalKing = kingSquare(board, rival);
  const check = rivalKing >= 0 && attacked(board, rivalKing, mover);
  const canRespond = hasAnyLegalMove(board, rival, ep, castling);

  let result: ChessState["result"] = "ongoing";
  let winner: ChessColor | null = null;
  if (!canRespond) {
    result = check ? "checkmate" : "stalemate";
    if (check) winner = mover;
  } else if (halfmove >= 100 || insufficientMaterial(board)) {
    result = "draw";
  }

  const san = sanFor(s, from, to, promotion, result === "checkmate" ? "#" : check ? "+" : "");

  return {
    board,
    turn: rival,
    castling,
    ep,
    halfmove,
    history: [...s.history, san],
    result,
    winner,
    check,
    lastMove: { from, to },
  };
}

export function lastMoveText(s: ChessState): string {
  return s.history.length ? s.history[s.history.length - 1] : "No moves yet";
}

export function chessSummary(s: ChessState): string {
  const name = (c: ChessColor) => (c === "w" ? "White" : "Black");
  if (s.result === "checkmate") return `Checkmate — ${s.winner ? name(s.winner) : "Nobody"} wins`;
  if (s.result === "stalemate") return "Stalemate — draw";
  if (s.result === "draw") return `Draw — ${s.halfmove >= 100 ? "50-move rule" : "insufficient material"}`;
  return `${name(s.turn)} to move${s.check ? " · check" : ""}`;
}
