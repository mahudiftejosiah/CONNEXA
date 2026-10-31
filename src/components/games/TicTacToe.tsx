"use client";

import { useState } from "react";
import { GameBtn, Stat } from "./shared";

type Cell = "X" | "O" | null;

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function winner(b: Cell[]): Cell | "draw" | null {
  for (const [a, c, d] of LINES) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  }
  return b.every(Boolean) ? "draw" : null;
}

function bestMove(b: Cell[]): number {
  let bestScore = -2;
  let move = -1;
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    const nb = b.slice();
    nb[i] = "O";
    const sc = score(nb, 0);
    if (sc > bestScore) { bestScore = sc; move = i; }
  }
  return move;
}
function score(b: Cell[], depth: number): number {
  const w = winner(b);
  if (w === "O") return 10 - depth;
  if (w === "X") return depth - 10;
  if (w === "draw") return 0;
  let best = depth % 2 === 0 ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    const nb = b.slice();
    nb[i] = depth % 2 === 0 ? "O" : "X";
    const sc = score(nb, depth + 1);
    if (depth % 2 === 0) best = Math.max(best, sc);
    else best = Math.min(best, sc);
  }
  return best === -Infinity || best === Infinity ? 0 : best;
}

export default function TicTacToe() {
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [record, setRecord] = useState({ w: 0, l: 0, d: 0 });
  const [locked, setLocked] = useState(false);

  const result = winner(board);

  function play(i: number) {
    if (board[i] || result || locked) return;
    const nb = board.slice();
    nb[i] = "X";
    const w = winner(nb);
    if (w) { finish(nb, w); return; }
    setBoard(nb);
    setLocked(true);
    setTimeout(() => {
      const mv = bestMove(nb);
      if (mv >= 0) nb[mv] = "O";
      const w2 = winner(nb);
      setBoard(nb.slice());
      if (w2) finish(nb, w2);
      setLocked(false);
    }, 350);
  }

  function finish(nb: Cell[], w: Cell | "draw") {
    setBoard(nb.slice());
    setRecord((r) => ({
      w: r.w + (w === "X" ? 1 : 0),
      l: r.l + (w === "O" ? 1 : 0),
      d: r.d + (w === "draw" ? 1 : 0),
    }));
  }

  function reset() {
    setBoard(Array(9).fill(null));
    setLocked(false);
  }

  const status = result === "X" ? "You win!" : result === "O" ? "CPU wins" : result === "draw" ? "Draw" : locked ? "CPU thinking…" : "Your move (X)";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <Stat label="Won" value={record.w} />
          <Stat label="Lost" value={record.l} />
          <Stat label="Draw" value={record.d} />
        </div>
        <GameBtn onClick={reset}>Reset board</GameBtn>
      </div>
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{status}</p>
      <div className="grid grid-cols-3 gap-2 w-fit mx-auto">
        {board.map((c, i) => (
          <button
            key={i}
            type="button"
            onClick={() => play(i)}
            className="w-20 h-20 rounded-xl border-2 text-3xl font-black flex items-center justify-center disabled:opacity-70"
            style={{
              borderColor: "var(--border)",
              backgroundColor: "var(--bg-card)",
              color: c === "X" ? "#12372A" : "#b45309",
            }}
            disabled={!!c || !!result || locked}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
