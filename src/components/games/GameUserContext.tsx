"use client";

import { createContext, useContext } from "react";

// Supplies the signed-in user id to the 2D games so their best scores / points
// can be saved to Supabase (and resumed on any device) instead of only localStorage.
export const GameUserContext = createContext<string | null>(null);

export function useGameUserId() {
  return useContext(GameUserContext);
}
