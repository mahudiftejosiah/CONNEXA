export type WhotColor = "red" | "yellow" | "green" | "blue" | "whot";

export type WhotCard = { id: string; color: WhotColor; number: number };

/**
 * `pickN`         - the player to move takes N cards unless they challenge with the same number.
 * `pickNchallenge` - a challenge was accepted: the player to move now takes 2 * N.
 */
export type WhotPending =
  | "none"
  | "pick1"
  | "pick2"
  | "pick5"
  | "pick1challenge"
  | "pick2challenge"
  | "pick5challenge"
  | "choosecolor";

export type WhotState = {
  queue: WhotCard[][];
  discard: WhotCard[];
  stock: WhotCard[];
  activeColor: WhotColor;
  turn: 0 | 1;
  pending: WhotPending;
  challenge: WhotCard[];
  result: "ongoing" | "won";
  winner: 0 | 1 | null;
  log: string[];
};

export type PlayOpts = { declaredNumber?: number; declaredColor?: WhotColor };

const COLORS: Exclude<WhotColor, "whot">[] = ["red", "yellow", "green", "blue"];
const SINGLES = [1, 2, 8, 12, 13, 14];
const DOUBLES = [5, 7, 9, 10, 11];

const PENALTY: Record<number, WhotPending> = { 1: "pick1", 2: "pick2", 5: "pick5", 14: "pick1" };
const PICK_AMOUNT: Record<WhotPending, number> = {
  none: 0,
  pick1: 1,
  pick2: 2,
  pick5: 5,
  pick1challenge: 2,
  pick2challenge: 4,
  pick5challenge: 10,
  choosecolor: 0,
};

const LOG_LIMIT = 40;

function buildDeck(): WhotCard[] {
  const deck: WhotCard[] = [];
  for (const color of COLORS) {
    for (const number of SINGLES) deck.push({ id: `${color}-${number}`, color, number });
    for (const number of DOUBLES) {
      deck.push({ id: `${color}-${number}-a`, color, number });
      deck.push({ id: `${color}-${number}-b`, color, number });
    }
    deck.push({ id: `whot-${color}`, color: "whot", number: 20 });
  }
  return deck;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(rng() * (i + 1))));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function other(p: 0 | 1): 0 | 1 {
  return p === 0 ? 1 : 0;
}

function pushLog(log: string[], entry: string): string[] {
  return [...log, entry].slice(-LOG_LIMIT);
}

function isPick(pending: WhotPending): boolean {
  return pending === "pick1" || pending === "pick2" || pending === "pick5";
}

function isRaised(pending: WhotPending): boolean {
  return pending === "pick1challenge" || pending === "pick2challenge" || pending === "pick5challenge";
}

function cap(color: WhotColor): string {
  return color === "whot" ? "Whot" : color.charAt(0).toUpperCase() + color.slice(1);
}

function topOf(s: WhotState): WhotCard | undefined {
  return s.discard.length ? s.discard[s.discard.length - 1] : undefined;
}

function cardAt(s: WhotState, player: 0 | 1, cardIdx: number): WhotCard | undefined {
  const hand = s.queue[player];
  return hand && cardIdx >= 0 && cardIdx < hand.length ? hand[cardIdx] : undefined;
}

export function initialWhot(rng?: () => number): WhotState {
  const deck = shuffle(buildDeck(), rng ?? Math.random);
  const p0: WhotCard[] = [];
  const p1: WhotCard[] = [];
  for (let i = 0; i < 5; i++) {
    const a = deck.pop();
    const b = deck.pop();
    if (a) p0.push(a);
    if (b) p1.push(b);
  }

  const stock = deck;
  let opening: WhotCard | undefined;
  for (let i = stock.length - 1; i >= 0; i--) {
    if (stock[i].color !== "whot") {
      opening = stock.splice(i, 1)[0];
      break;
    }
  }
  opening = opening ?? stock.pop();
  const discard = opening ? [opening] : [];

  const penalty = opening ? PENALTY[opening.number] : undefined;
  const state: WhotState = {
    queue: [p0, p1],
    discard,
    stock,
    activeColor: discard[0]?.color ?? "red",
    turn: 0,
    pending: penalty ?? "none",
    challenge: [],
    result: "ongoing",
    winner: null,
    log: [],
  };

  const label = opening ? `${cap(opening.color)} ${opening.number}` : "an empty table";
  state.log = pushLog(
    state.log,
    penalty
      ? `Opens with ${label} — Player 1 picks ${PICK_AMOUNT[penalty]}`
      : `Opens with ${label}`
  );
  return state;
}

export function canChallenge(s: WhotState, cardIdx: number): boolean {
  if (s.result === "won" || !isPick(s.pending)) return false;
  const card = cardAt(s, s.turn, cardIdx);
  const top = topOf(s);
  if (!card || !top || top.color === "whot" || card.color === "whot") return false;
  return card.number === top.number;
}

export function isPlayable(
  s: WhotState,
  cardIdx: number,
  opts?: PlayOpts
): boolean {
  if (s.result === "won") return false;
  const card = cardAt(s, s.turn, cardIdx);
  if (!card) return false;
  if (s.pending === "choosecolor") return false;
  if (opts?.declaredNumber != null && opts.declaredNumber !== card.number) return false;

  if (isPick(s.pending) || isRaised(s.pending)) return canChallenge(s, cardIdx);

  if (card.color === "whot") return true;

  const top = topOf(s);
  if (!top) return true;
  if (card.color === s.activeColor) return true;
  if (top.color !== "whot" && card.number === top.number) return true;
  return false;
}

export function playCard(s: WhotState, cardIdx: number, opts?: PlayOpts): WhotState {
  if (s.result === "won") return s;
  if (!isPlayable(s, cardIdx, opts)) return s;

  const me = s.turn;
  const foe = other(me);
  const card = cardAt(s, me, cardIdx)!;
  const top = topOf(s);
  const hand = s.queue[me].filter((c) => c.id !== card.id);
  const queue = s.queue.map((h, i) => (i === me ? h.filter((c) => c.id !== card.id) : h.slice()));
  const discard = [...s.discard, card];

  let activeColor = s.activeColor;
  let pending: WhotPending = "none";
  let challenge: WhotCard[] = [];
  let turn: 0 | 1 = foe;
  let log = s.log;
  const who = `Player ${me + 1}`;
  const rival = `Player ${foe + 1}`;

  if (card.color === "whot") {
    const chosen =
      opts?.declaredColor && opts.declaredColor !== "whot" ? opts.declaredColor : undefined;

    if (top && top.color === "whot") {
      // Two Whots back to back is a challenge: the player who laid the first one
      // now pays four, so the turn goes back to them.
      turn = foe;
      pending = "pick2challenge";
      challenge = [top, card];
      if (chosen) activeColor = chosen;
      log = pushLog(log, `${who} answers Whot with Whot — ${rival} picks 4`);
    } else if (chosen) {
      activeColor = chosen;
      log = pushLog(log, `${who} plays Whot — chose ${cap(chosen)}`);
    } else {
      pending = "choosecolor";
      log = pushLog(log, `${who} plays Whot — colour still to be chosen`);
    }
  } else {
    activeColor = card.color;

    if (isPick(s.pending)) {
      const raised = `${s.pending}challenge` as WhotPending;
      turn = foe;
      pending = raised;
      challenge = top ? [top, card] : [card];
      log = pushLog(
        log,
        `${who} challenges with ${card.number} — ${rival} picks ${PICK_AMOUNT[raised]}`
      );
    } else {
      const penalty = PENALTY[card.number];
      const label = `${cap(card.color)} ${card.number}`;
      if (penalty) {
        pending = penalty;
        log = pushLog(log, `${who} plays ${label} — ${rival} picks ${PICK_AMOUNT[penalty]}`);
      } else if (card.number === 7 || card.number === 8 || card.number === 9) {
        // With two players a reverse lands straight back on the player who laid it.
        turn = me;
        log = pushLog(log, `${who} plays ${label} — another go`);
      } else {
        log = pushLog(log, `${who} plays ${label}`);
      }
    }
  }

  const won = hand.length === 0;
  if (won) log = pushLog(log, `${who} is out — game over`);
  return {
    queue,
    discard,
    stock: s.stock.slice(),
    activeColor,
    turn: won ? me : turn,
    pending: won ? "none" : pending,
    challenge: won ? [] : challenge,
    result: won ? "won" : "ongoing",
    winner: won ? me : null,
    log,
  };
}

export function drawStock(s: WhotState, count: number, rng?: () => number): WhotState {
  if (s.result === "won" || count <= 0) return s;
  const rand = rng ?? Math.random;
  const stock = s.stock.slice();
  const discard = s.discard.slice();
  const hand = s.queue[s.turn].slice();
  let taken = 0;

  for (let i = 0; i < count; i++) {
    if (stock.length === 0) {
      if (discard.length <= 1) break;
      const top = discard.pop()!;
      stock.push(...shuffle(discard, rand));
      discard.length = 0;
      discard.push(top);
    }
    const card = stock.pop();
    if (!card) break;
    hand.push(card);
    taken++;
  }

  if (taken === 0) return s;
  return {
    ...s,
    queue: s.queue.map((h, i) => (i === s.turn ? hand : h.slice())),
    stock,
    discard,
    log: pushLog(s.log, `Player ${s.turn + 1} picks ${taken}`),
  };
}

export function resolvePending(s: WhotState, rng?: () => number): WhotState {
  if (s.result === "won" || s.pending === "none") return s;
  if (s.pending === "choosecolor") return declareColor(s, s.activeColor);

  const loser = s.turn;
  const winner = other(loser);
  const raised = isRaised(s.pending);
  const amount = PICK_AMOUNT[s.pending];

  let next: WhotState = { ...s, pending: "none", challenge: [] };
  next = drawStock(next, amount, rng);

  if (raised) {
    // The cards laid down during the challenge leave the pile and join the winner.
    const discard = next.discard.slice();
    const taken: WhotCard[] = [];
    while (taken.length < s.challenge.length && discard.length > 1) {
      const card = discard.pop();
      if (card) taken.unshift(card);
    }
    const queue = next.queue.map((h, i) => (i === winner ? [...h, ...taken] : h.slice()));
    const top = discard[discard.length - 1];
    next = {
      ...next,
      queue,
      discard,
      activeColor: top && top.color !== "whot" ? top.color : next.activeColor,
    };
  }

  return {
    ...next,
    turn: winner,
    log: pushLog(next.log, raised ? `Player ${winner + 1} wins the challenge` : `Player ${winner + 1} plays on`),
  };
}

export function drawForced(s: WhotState, rng?: () => number): WhotState {
  return resolvePending(s, rng);
}

export function declareColor(s: WhotState, color: WhotColor): WhotState {
  if (s.pending !== "choosecolor") return s;
  const activeColor: Exclude<WhotColor, "whot"> =
    color === "whot" ? lastPlainColor(s) : color;
  return {
    ...s,
    activeColor,
    pending: "none",
    log: pushLog(s.log, `Player ${s.turn + 1} chose ${cap(activeColor)}`),
  };
}

function lastPlainColor(s: WhotState): Exclude<WhotColor, "whot"> {
  for (let i = s.discard.length - 1; i >= 0; i--) {
    const card = s.discard[i];
    if (card.color !== "whot") return card.color;
  }
  return s.activeColor === "whot" ? "red" : s.activeColor;
}

export function handCount(s: WhotState, p: 0 | 1): number {
  return s.queue[p]?.length ?? 0;
}

export function pendingPickCount(s: WhotState): number {
  return PICK_AMOUNT[s.pending];
}

export function lastMoveText(s: WhotState): string {
  const top = topOf(s);
  if (!top) return "No card in play";
  if (top.color === "whot") return `Whot — chose ${cap(s.activeColor)}`;
  return `${cap(top.color)} ${top.number}`;
}

export function whotSummary(s: WhotState, me?: 0 | 1): string {
  const top = topOf(s);
  const detail = `colour ${cap(s.activeColor)} · top ${
    !top ? "none" : top.color === "whot" ? "Whot" : top.number
  }`;

  if (s.result === "won") {
    const win = s.winner;
    const who = me == null ? (win == null ? "Nobody" : `Player ${win + 1}`) : win === me ? "You" : "Your opponent";
    return `${who} won · ${detail}`;
  }

  const actor =
    me == null
      ? s.turn === 0
        ? "Player 1 must"
        : "Player 2 must"
      : s.turn === me
        ? "You must"
        : "Opponent must";
  const possessor = me == null ? `Player ${s.turn + 1}'s` : s.turn === me ? "Your" : "Opponent's";
  const match = top && top.color !== "whot" ? top.number : "a matching card";

  if (s.pending === "choosecolor") return `${actor} choose a colour`;
  if (isRaised(s.pending)) return `${actor} pick ${PICK_AMOUNT[s.pending]} · ${detail}`;
  if (isPick(s.pending))
    return `${actor} pick ${PICK_AMOUNT[s.pending]} (or challenge with a ${match})`;
  return `${possessor} turn · ${detail}`;
}
