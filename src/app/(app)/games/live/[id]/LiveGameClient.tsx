"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Maximize2, Minimize2, Clock, Trophy, XCircle, CheckCircle } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { cancelChallenge, respondToChallenge, requestRematch, submitGameState } from "@/lib/actions/games";
import ChessBoard from "@/components/games/live/ChessBoard";
import LudoBoard from "@/components/games/live/LudoBoard";
import WhotTable from "@/components/games/live/WhotTable";
import toast from "react-hot-toast";
import type { GameRequest } from "@/lib/supabase/types";

type Player = { id: string; display_name: string; username: string; avatar_url: string | null };

const NAME: Record<string, string> = { whot: "Whot", chess: "Chess", ludo: "Ludo" };

// Each engine keeps "whose turn" in its own shape; both board components use
// index 0 = challenger and 1 = opponent.
function turnIndex(game: string, state: any): 0 | 1 | null {
  if (!state) return null;
  if (game === "chess") return state.turn === "w" ? 0 : 1;
  return state.turn === 0 ? 0 : 1;
}

function finishedWinner(game: string, state: any): 0 | 1 | null | undefined {
  if (!state) return undefined;
  if (game === "chess") {
    if (state.result === "ongoing") return undefined;
    return state.winner ? (state.winner === "w" ? 0 : 1) : null;
  }
  if (state.result === "won") return state.winner;
  if (state.result === "draw") return null;
  return undefined;
}

export function LiveGameClient({
  initial,
  challenger,
  opponent,
  myId,
}: {
  initial: GameRequest;
  challenger: Player;
  opponent: Player;
  myId: string;
}) {
  const [row, setRow] = useState(initial);
  const [isFs, setIsFs] = useState(false);
  const [busy, setBusy] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const players = [challenger, opponent];
  const myIndex = myId === challenger.id ? 0 : myId === opponent.id ? 1 : null;
  const otherIndex = myIndex === 0 ? 1 : 0;
  const state = row.state as any;
  const ti = turnIndex(row.game, state);
  const winnerFromState = finishedWinner(row.game, state);
  const finished = row.status === "done" || winnerFromState !== undefined;
  const myTurn = !finished && row.status === "accepted" && myIndex !== null && ti === myIndex;
  const pending = row.status === "pending";

  useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else frameRef.current?.requestFullscreen().catch(() => {});
  }

  async function refresh() {
    const { data } = await supabase.from("game_requests").select("*").eq("id", row.id).single();
    if (data) setRow(data as GameRequest);
  }

  // Realtime, with a slow poll as a safety net if the publication is not set.
  useEffect(() => {
    if (finished) return;
    const channel = supabase
      .channel(`game_request:${row.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_requests", filter: `id=eq.${row.id}` },
        (payload) => setRow(payload.new as GameRequest))
      .subscribe();
    const timer = setInterval(() => { void refresh(); }, 4000);
    return () => { clearInterval(timer); supabase.removeChannel(channel); };
  }, [row.id, finished]);

  async function onPlay(next: any) {
    const wi = finishedWinner(row.game, next);
    const over = wi !== undefined;
    const ni = turnIndex(row.game, next);
    const turnUser = over || ni === null ? null : players[ni].id;
    const winnerId = over && wi !== null ? players[wi].id : null;

    setRow((p) => ({
      ...p,
      state: next,
      turn: turnUser,
      status: over ? "done" : p.status,
      winner_id: winnerId ?? p.winner_id,
    }));

    const res = await submitGameState(row.id, next, turnUser, winnerId);
    if (res?.error) { toast.error(res.error); void refresh(); }
  }

  async function accept(yes: boolean) {
    setBusy(true);
    const res = await respondToChallenge(row.id, yes);
    setBusy(false);
    if (res?.error) { toast.error(res.error); return; }
    if (yes) toast.success("Game on — good luck!");
    void refresh();
  }

  async function cancel() {
    setBusy(true);
    const res = await cancelChallenge(row.id);
    setBusy(false);
    if (res?.error) { toast.error(res.error); return; }
    void refresh();
  }

  async function rematch() {
    setBusy(true);
    const res = await requestRematch(row.id);
    setBusy(false);
    if (res?.error) { toast.error(res.error); return; }
    toast.success("Rematch requested.");
    if (res.id) window.location.href = `/games/live/${res.id}`;
  }

  const board = (() => {
    if (!state || row.status !== "accepted") return null;
    const idx = myIndex ?? 0;
    if (row.game === "chess") return <ChessBoard state={state} me={idx as 0 | 1} onPlay={onPlay} disabled={!myTurn} />;
    if (row.game === "ludo") return <LudoBoard state={state} me={idx as 0 | 1} onPlay={onPlay} disabled={!myTurn} />;
    return <WhotTable state={state} me={idx as 0 | 1} onPlay={onPlay} disabled={!myTurn} />;
  })();

  return (
    <div ref={frameRef} className="game-frame space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/games" className="p-2 rounded-xl hover:bg-[var(--border)]" aria-label="Back to games">
          <ArrowLeft className="w-5 h-5 text-[var(--text-secondary)]" />
        </Link>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">{NAME[row.game] || "Live game"}</h1>
        <button onClick={toggleFullscreen}
          className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl border"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-primary)" }}>
          {isFs ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          {isFs ? "Exit full screen" : "Full screen"}
        </button>
      </div>

      <div className="card p-3 flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Avatar src={challenger.avatar_url} name={challenger.display_name} size={40} />
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate text-[var(--text-primary)]">{challenger.display_name}</p>
            <p className="text-xs text-[var(--text-secondary)]">@{challenger.username}</p>
          </div>
        </div>
        <span className="text-xs font-extrabold uppercase px-2 py-1 rounded-lg" style={{ backgroundColor: "rgb(var(--a-800) / 0.12)", color: "rgb(var(--a-800))" }}>vs</span>
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end text-right">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate text-[var(--text-primary)]">{opponent.display_name}</p>
            <p className="text-xs text-[var(--text-secondary)]">@{opponent.username}</p>
          </div>
          <Avatar src={opponent.avatar_url} name={opponent.display_name} size={40} />
        </div>
      </div>

      {pending && (
        <div className="card p-6 text-center space-y-3">
          {myIndex === 0 ? (
            <>
              <Clock className="w-9 h-9 mx-auto text-[var(--text-secondary)]" />
              <p className="font-semibold text-[var(--text-primary)]">Waiting for {opponent.display_name} to accept…</p>
              <p className="text-sm text-[var(--text-secondary)]">The challenge is already in their notifications box.</p>
              <Button variant="ghost" loading={busy} icon={<XCircle className="w-4 h-4 text-red-500" />} onClick={cancel}>Cancel challenge</Button>
            </>
          ) : myIndex === 1 ? (
            <>
              <p className="font-semibold text-[var(--text-primary)]">{challenger.display_name} challenges you to {NAME[row.game]}</p>
              <div className="flex items-center justify-center gap-2">
                <Button loading={busy} icon={<CheckCircle className="w-4 h-4" />} onClick={() => accept(true)}>Accept challenge</Button>
                <Button variant="ghost" loading={busy} onClick={() => accept(false)}>Decline</Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">This challenge is not for you.</p>
          )}
        </div>
      )}

      {row.status === "declined" && (
        <div className="card p-6 text-center"><p className="text-sm text-[var(--text-secondary)]">{opponent.display_name} declined the challenge.</p></div>
      )}
      {(row.status === "cancelled") && (
        <div className="card p-6 text-center"><p className="text-sm text-[var(--text-secondary)]">This challenge was cancelled.</p></div>
      )}

      {board}

      {finished && (
        <div className="card p-6 text-center space-y-3">
          <Trophy className="w-10 h-10 mx-auto text-yellow-500" />
          <p className="font-bold text-lg text-[var(--text-primary)]">
            {row.winner_id
              ? `${players.find((p) => p.id === row.winner_id)?.display_name || "Someone"} wins!`
              : "It&apos;s a draw."}
          </p>
          {myIndex !== null && (
            <Button loading={busy} onClick={rematch}>Request rematch</Button>
          )}
        </div>
      )}
    </div>
  );
}
