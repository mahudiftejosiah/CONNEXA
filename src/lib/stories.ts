import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Profile, StoryWithAuthor } from "@/lib/supabase/types";
import { signStoryMedia } from "@/lib/media";
import { storyAuthorIds } from "@/lib/story-audience";

export type StoryClient = SupabaseClient<Database>;

/**
 * One author and every live story they published, oldest first.
 * `hasUnviewed` is the viewer's own truth: it is true when at least one of the
 * author's stories has not been watched by the person looking at the screen.
 */
export interface StoryGroup {
  author: Profile;
  stories: StoryWithAuthor[];
  hasUnviewed: boolean;
}

/**
 * The live stories the viewer is allowed to see: their own, their friends' and
 * the people they follow, minus anything the database has already expired.
 *
 * This is the one place that asks the database for stories. Every surface
 * (homepage, Stories section, profile) uses it, so a story published by a friend
 * shows up in all of them from the same source.
 */
export async function fetchActiveStories(
  supabase: StoryClient,
  viewerId: string
): Promise<StoryWithAuthor[]> {
  const authorIds = await storyAuthorIds(supabase, viewerId);
  if (authorIds.length === 0) return [];

  const { data: rows } = await supabase
    .from("stories")
    .select("*, author:profiles(*)")
    .in("author_id", authorIds)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(60);

  const stories = (rows ?? []) as unknown as StoryWithAuthor[];
  if (stories.length === 0) return [];

  const storyIds = stories.map((s) => s.id);
  const { data: views } = await supabase
    .from("story_views")
    .select("story_id")
    .eq("viewer_id", viewerId)
    .in("story_id", storyIds);

  const viewed = new Set((views ?? []).map((v) => v.story_id));
  const withState = stories.map((s) => ({ ...s, has_viewed: viewed.has(s.id) }));

  // The stories bucket is private, so every path becomes a signed URL here.
  return (await signStoryMedia(supabase, withState)) as unknown as StoryWithAuthor[];
}

/**
 * Groups stories by author and orders the groups the way a story tray should
 * read: the viewer's own story first, then everybody who has something they
 * have not seen yet, then the ones they have already watched.
 */
export function groupStories(stories: StoryWithAuthor[], viewerId: string): StoryGroup[] {
  const map = new Map<string, StoryGroup>();

  for (const story of stories) {
    let group = map.get(story.author_id);
    if (!group) {
      group = { author: story.author, stories: [], hasUnviewed: false };
      map.set(story.author_id, group);
    }
    group.stories.push(story);
    if (!story.has_viewed) group.hasUnviewed = true;
  }

  const groups = Array.from(map.values());
  for (const group of groups) {
    group.stories.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }

  return groups.sort((a, b) => {
    const aOwn = a.author.id === viewerId ? 0 : 1;
    const bOwn = b.author.id === viewerId ? 0 : 1;
    if (aOwn !== bOwn) return aOwn - bOwn;
    if (a.hasUnviewed !== b.hasUnviewed) return a.hasUnviewed ? -1 : 1;
    const aAt = a.stories[a.stories.length - 1]?.created_at ?? "";
    const bAt = b.stories[b.stories.length - 1]?.created_at ?? "";
    return bAt.localeCompare(aAt);
  });
}

/** The order the stories are played in: group by group, oldest story first. */
export function playbackSequence(groups: StoryGroup[]): StoryWithAuthor[] {
  return groups.flatMap((group) => group.stories);
}

/**
 * The author's story a tray tile should open: the first one the viewer has not
 * watched, and any story at all when they have seen them all.
 */
export function firstStoryFor(groups: StoryGroup[], authorId: string): StoryWithAuthor | null {
  const group = groups.find((g) => g.author.id === authorId);
  if (!group) return null;
  return group.stories.find((s) => !s.has_viewed) ?? group.stories[0] ?? null;
}

/** Marks a story as watched by this viewer — one row, never a duplicate. */
export async function markStoryViewed(
  supabase: StoryClient,
  storyId: string,
  viewerId: string
): Promise<boolean> {
  // The author watching their own story is not a view: it would put them in
  // their own viewer list and count them as an audience.
  const { data: story } = await supabase
    .from("stories")
    .select("author_id")
    .eq("id", storyId)
    .maybeSingle();
  if (!story || story.author_id === viewerId) return false;

  // The database function (migration 039) records the view and keeps the
  // counter in step. Before that paste the plain row is written instead.
  const { error } = await supabase.rpc("mark_story_viewed", { p_story: storyId });
  if (!error) return true;

  const { error: insertError } = await supabase
    .from("story_views")
    .upsert(
      { story_id: storyId, viewer_id: viewerId },
      { onConflict: "story_id,viewer_id", ignoreDuplicates: true }
    );
  return !insertError;
}
