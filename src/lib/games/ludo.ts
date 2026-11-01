export type LudoState = {
  pieces: number[][];
  dice: number | null;
  turn: 0 | 1;
  rolled: boolean;
  result: "ongoing" | "won";
  winner: 0 | 1 | null;
  log: string[];
  lastMove: { from: number; to: number; captured: boolean } | null;
};

// 2-player variant: player 0 (red) and player 1 (green) share the same 52-cell
// ring entering from opposite sides (starts 0 and 26). A token's path is
// steps 0..50 on the ring, steps 51..56 on that player's home column (encoded
// 100..105 — the same numbers are used for both players because pieces live in
// per-player rows), then FINISH (200) at the centre. -1 means still in base.
const START: [number, number] = [0, 26];
const HOME_FIRST = 100;
const HOME_LAST = 105;
const FINISH = 200;
const LAST_RING_STEP = 50;
const FINISH_STEP = 57;
const BASE = -1;

export function safeCells(): number[] {
  return [0, 13, 26, 39];
}

export function pieceColor(p: 0 | 1): "red" | "green" {
  return p === 0 ? "red" : "green";
}

const nameOf = (p: 0 | 1) => (p === 0 ? "Red" : "Green");
const other = (p: 0 | 1): 0 | 1 => (p === 0 ? 1 : 0);

const cellLabel = (v: number) =>
  v === BASE ? "Base" : v === FINISH ? "Home" : v >= HOME_FIRST && v <= HOME_LAST ? `Home ${v - HOME_FIRST + 1}` : String(v);

export function initialLudo(): LudoState {
  return {
    pieces: [
      [BASE, BASE, BASE, BASE],
      [BASE, BASE, BASE, BASE],
    ],
    dice: null,
    turn: 0,
    rolled: false,
    result: "ongoing",
    winner: null,
    log: [],
    lastMove: null,
  };
}

// Steps a token at `cell` has travelled from its player's start, or null when
// the cell is not on that player's path (own home column cells of the rival,
// the one skipped ring cell, or base).
function cellToSteps(p: 0 | 1, cell: number): number | null {
  if (cell === FINISH) return FINISH_STEP;
  if (cell >= HOME_FIRST && cell <= HOME_LAST) return LAST_RING_STEP + 1 + (cell - HOME_FIRST);
  if (cell >= 0 && cell <= 51) {
    const d = (((cell - START[p]) % 52) + 52) % 52;
    return d <= LAST_RING_STEP ? d : null;
  }
  return null;
}

// Destination cell for a token at `from` rolled `dice`, or null when the move
// is impossible (base without a 6, overshooting the centre).
function targetCell(p: 0 | 1, from: number, dice: number): number | null {
  if (from === BASE) return dice === 6 ? START[p] : null;
  const steps = cellToSteps(p, from);
  if (steps === null) return null;
  const t = steps + dice;
  if (t > FINISH_STEP) return null;
  if (t <= LAST_RING_STEP) return (START[p] + t) % 52;
  if (t <= FINISH_STEP - 1) return HOME_FIRST + (t - (LAST_RING_STEP + 1));
  return FINISH;
}

export function movablePieces(s: LudoState): number[] {
  if (s.result !== "ongoing" || !s.rolled || s.dice === null) return [];
  const p = s.turn;
  const dice = s.dice;
  const out: number[] = [];
  s.pieces[p].forEach((cell, i) => {
    const to = targetCell(p, cell, dice);
    if (to === null) return;
    // Finished tokens stack at the centre; on any other cell your own token blocks.
    if (to !== FINISH && s.pieces[p].some((c) => c === to)) return;
    out.push(i);
  });
  return out;
}

export function rollDice(s: LudoState, rng?: () => number): LudoState {
  if (s.result !== "ongoing" || s.rolled || s.dice !== null) return s;
  const dice = Math.min(6, Math.max(1, 1 + Math.floor((rng ?? Math.random)() * 6)));
  const rolled: LudoState = { ...s, dice, rolled: true, log: [...s.log, `${nameOf(s.turn)} rolled ${dice}`].slice(-40) };
  if (movablePieces(rolled).length === 0) {
    return {
      ...rolled,
      dice: null,
      rolled: false,
      turn: other(s.turn),
      log: [...rolled.log, "No move — pass"].slice(-40),
    };
  }
  return rolled;
}

export function movePiece(s: LudoState, pieceIdx: number): LudoState {
  if (s.result !== "ongoing" || !s.rolled || s.dice === null) return s;
  if (!movablePieces(s).includes(pieceIdx)) return s;

  const p = s.turn;
  const o = other(p);
  const dice = s.dice;
  const from = s.pieces[p][pieceIdx];
  const to = targetCell(p, from, dice);
  if (to === null) return s;

  const pieces = s.pieces.map((row) => [...row]);
  pieces[p][pieceIdx] = to;

  let captured = false;
  if (to >= 0 && to <= 51 && !safeCells().includes(to)) {
    pieces[o] = pieces[o].map((c) => {
      if (c !== to) return c;
      captured = true;
      return BASE;
    });
  }

  const log = [...s.log, `${nameOf(p)} ${pieceIdx + 1}: ${cellLabel(from)} → ${cellLabel(to)}`];
  if (captured) log.push(`${nameOf(p)} captured ${nameOf(o)}'s token`);
  const won = pieces[p].every((c) => c === FINISH);
  if (won) log.push(`${nameOf(p)} wins`);

  // A 6, a capture, or reaching the centre earns another roll.
  const again = dice === 6 || captured || to === FINISH;

  return {
    pieces,
    dice: null,
    rolled: false,
    turn: again ? p : o,
    result: won ? "won" : "ongoing",
    winner: won ? p : null,
    log: log.slice(-40),
    lastMove: { from, to, captured },
  };
}

export function lastMoveText(s: LudoState): string {
  if (!s.lastMove) return "No moves yet";
  const { from, to, captured } = s.lastMove;
  return `${cellLabel(from)} → ${cellLabel(to)}${captured ? " · capture" : ""}`;
}

export function ludoSummary(s: LudoState): string {
  if (s.result === "won" && s.winner !== null) return `${nameOf(s.winner)} wins`;
  if (s.rolled && s.dice !== null) return `You rolled ${s.dice} · pick a token`;
  return "Your turn · roll the dice";
}
