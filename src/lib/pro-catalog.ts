// The PRO feature list the whole app reads. Migration 029 keeps the same keys in
// pro_features so an administrator's switch and the menu entry are one thing.

export type ProBucket = "identity" | "community" | "entertainment" | "creator";

export type ProFeatureMeta = {
  key: string;
  label: string;
  blurb: string;
  bucket: ProBucket;
  href: string | null;
};

export const PRO_FEATURES: ProFeatureMeta[] = [
  { key: "pro_id", label: "PRO ID & Analytics", blurb: "A gold PRO badge on your name, plus a private dashboard of real profile and post numbers.", bucket: "identity", href: "/pro/analytics" },
  { key: "daily_questions", label: "Daily Questions", blurb: "One question a day, answered by the community you want to hear from.", bucket: "community", href: "/pro/questions" },
  { key: "confessions", label: "Anonymous Confessions", blurb: "Say the thing without a name attached. Only moderators can ever see who wrote it.", bucket: "community", href: "/pro/confessions" },
  { key: "polls", label: "Community Polls", blurb: "Ask a question with choices and watch the counts move in real numbers.", bucket: "community", href: "/pro/polls" },
  { key: "trending_hashtags", label: "Trending Hashtags", blurb: "The tags CONNEXA people are actually using right now, from live posts.", bucket: "community", href: "/pro/trending" },
  { key: "quiz_battles", label: "Live Quiz Battles", blurb: "Timed quizzes against the clock, run inside the Study Room.", bucket: "entertainment", href: "/pro/quizzes" },
  { key: "music_corner", label: "Music Corner", blurb: "Share tracks and build playlists of your own, from legally supported music sources.", bucket: "entertainment", href: "/pro/music" },
  { key: "live_streaming", label: "Live Streaming", blurb: "Go live to your followers with the same broadcaster everyone already uses.", bucket: "entertainment", href: "/live" },
  { key: "events_hub", label: "Events Hub", blurb: "Publish an event with a poster, dates and a guest list people can join.", bucket: "entertainment", href: "/pro/events" },
  { key: "achievement_badges", label: "Achievement Badges", blurb: "Milestones earned from real activity, awarded by the server, never bought.", bucket: "creator", href: "/pro/badges" },
  { key: "memories", label: "Memories", blurb: "Your own posts from a year ago, a month ago and this day last week.", bucket: "creator", href: "/pro/memories" },
  { key: "creator_dashboard", label: "Creator Dashboard", blurb: "Which posts landed, which fell flat, and how the audience grew.", bucket: "creator", href: "/pro/creator" },
  { key: "marketplace", label: "CONNEXA Marketplace", blurb: "List a product or a service, reviewed by an admin before anyone sees it.", bucket: "creator", href: "/pro/marketplace" },
];

export const PRO_BUCKETS: { id: ProBucket; label: string; note: string }[] = [
  { id: "identity", label: "PRO ID & Analytics", note: "Who you are on CONNEXA, and what your account is doing." },
  { id: "community", label: "Social & Community", note: "Questions, confessions, polls and what is trending." },
  { id: "entertainment", label: "Entertainment", note: "Quizzes, music, live streaming and events." },
  { id: "creator", label: "Creator & Lifestyle", note: "Badges, memories, a creator dashboard and a marketplace." },
];

export function featuresInBucket(bucket: ProBucket): ProFeatureMeta[] {
  return PRO_FEATURES.filter((f) => f.bucket === bucket);
}

export function featureByKey(key: string): ProFeatureMeta | undefined {
  return PRO_FEATURES.find((f) => f.key === key);
}
