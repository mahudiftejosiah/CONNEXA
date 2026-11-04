import { revalidatePath } from "next/cache";

/**
 * Admin-side writes must reach every public page the moment they save, so the
 * whole layout tree is invalidated instead of a hand-picked list of routes.
 */
export function revalidateSite(): void {
  revalidatePath("/", "layout");
}
