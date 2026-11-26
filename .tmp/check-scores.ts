import { fetchScoreDay, todayUtc, shiftUtcDate } from "../src/lib/scores.ts";

for (const sport of ["soccer", "basketball", "tennis"]) {
  const day = await fetchScoreDay(sport, todayUtc());
  const all = day.groups.flatMap((g) => g.matches);
  console.log(sport, "groups", day.groups.length, "matches", all.length,
    "live", all.filter((m) => m.live).length,
    "finished", all.filter((m) => m.finished).length);
  console.log("  sample:", JSON.stringify(all.find((m) => m.live) || all[0]));
  console.log("  header:", day.groups.slice(0, 3).map((g) => `${g.competition} | ${g.stage}`).join("  //  "));
}
console.log("tomorrow:", shiftUtcDate(todayUtc(), 1), "yesterday:", shiftUtcDate(todayUtc(), -1));
