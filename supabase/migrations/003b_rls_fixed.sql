-- Run this SECOND, after 002b_fix_functions.sql succeeds

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies cleanly
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.' || quote_ident(r.tablename);
  END LOOP;
END $$;

-- PROFILES
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (
  profile_visibility = 'public' OR auth.uid() = id
  OR (profile_visibility = 'friends' AND public.are_friends(auth.uid(), id))
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE)
);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE USING (
  auth.uid() = id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE)
);

-- USER PREFERENCES
CREATE POLICY "prefs_select" ON public.user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "prefs_insert" ON public.user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "prefs_update" ON public.user_preferences FOR UPDATE USING (auth.uid() = user_id);

-- POSTS
CREATE POLICY "posts_select" ON public.posts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE)
  OR author_id = auth.uid()
  OR (visibility = 'public' AND NOT public.is_blocked(auth.uid(), author_id))
  OR (visibility = 'friends' AND public.are_friends(auth.uid(), author_id) AND NOT public.is_blocked(auth.uid(), author_id))
  OR (group_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.group_memberships WHERE group_id = posts.group_id AND user_id = auth.uid()))
);
CREATE POLICY "posts_insert" ON public.posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "posts_update" ON public.posts FOR UPDATE USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);
CREATE POLICY "posts_delete" ON public.posts FOR DELETE USING (
  auth.uid() = author_id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE)
);

-- POST MEDIA
CREATE POLICY "post_media_select" ON public.post_media FOR SELECT USING (EXISTS (SELECT 1 FROM public.posts WHERE id = post_id));
CREATE POLICY "post_media_insert" ON public.post_media FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.posts WHERE id = post_id AND author_id = auth.uid()));
CREATE POLICY "post_media_delete" ON public.post_media FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.posts WHERE id = post_id AND author_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE)
);

-- REACTIONS
CREATE POLICY "reactions_select" ON public.reactions FOR SELECT USING (TRUE);
CREATE POLICY "reactions_insert" ON public.reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reactions_delete" ON public.reactions FOR DELETE USING (auth.uid() = user_id);

-- COMMENTS
CREATE POLICY "comments_select" ON public.comments FOR SELECT USING (EXISTS (SELECT 1 FROM public.posts WHERE id = post_id));
CREATE POLICY "comments_insert" ON public.comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "comments_update" ON public.comments FOR UPDATE USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);
CREATE POLICY "comments_delete" ON public.comments FOR DELETE USING (
  auth.uid() = author_id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE)
);

-- FRIEND REQUESTS
CREATE POLICY "friend_requests_select" ON public.friend_requests FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "friend_requests_insert" ON public.friend_requests FOR INSERT WITH CHECK (auth.uid() = sender_id AND NOT public.is_blocked(auth.uid(), receiver_id));
CREATE POLICY "friend_requests_update" ON public.friend_requests FOR UPDATE USING (auth.uid() = receiver_id OR auth.uid() = sender_id);
CREATE POLICY "friend_requests_delete" ON public.friend_requests FOR DELETE USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- FRIENDSHIPS
CREATE POLICY "friendships_select" ON public.friendships FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "friendships_insert" ON public.friendships FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "friendships_delete" ON public.friendships FOR DELETE USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- FOLLOWERS
CREATE POLICY "followers_select" ON public.followers FOR SELECT USING (TRUE);
CREATE POLICY "followers_insert" ON public.followers FOR INSERT WITH CHECK (auth.uid() = follower_id AND NOT public.is_blocked(auth.uid(), following_id));
CREATE POLICY "followers_delete" ON public.followers FOR DELETE USING (auth.uid() = follower_id);

-- USER BLOCKS
CREATE POLICY "user_blocks_select" ON public.user_blocks FOR SELECT USING (auth.uid() = blocker_id);
CREATE POLICY "user_blocks_insert" ON public.user_blocks FOR INSERT WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "user_blocks_delete" ON public.user_blocks FOR DELETE USING (auth.uid() = blocker_id);

-- STORIES
CREATE POLICY "stories_select" ON public.stories FOR SELECT USING (
  expires_at > NOW() AND (author_id = auth.uid() OR NOT public.is_blocked(auth.uid(), author_id))
);
CREATE POLICY "stories_insert" ON public.stories FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "stories_delete" ON public.stories FOR DELETE USING (
  auth.uid() = author_id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE)
);

-- STORY VIEWS
CREATE POLICY "story_views_select" ON public.story_views FOR SELECT USING (
  viewer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.stories WHERE id = story_id AND author_id = auth.uid())
);
CREATE POLICY "story_views_insert" ON public.story_views FOR INSERT WITH CHECK (auth.uid() = viewer_id);

-- CONVERSATIONS
CREATE POLICY "conversations_select" ON public.conversations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversation_participants WHERE conversation_id = id AND user_id = auth.uid())
);
CREATE POLICY "conversations_insert" ON public.conversations FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "conversations_update" ON public.conversations FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.conversation_participants WHERE conversation_id = id AND user_id = auth.uid())
);

-- CONVERSATION PARTICIPANTS
CREATE POLICY "conv_participants_select" ON public.conversation_participants FOR SELECT USING (
  user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.conversation_participants cp2 WHERE cp2.conversation_id = conversation_id AND cp2.user_id = auth.uid())
);
CREATE POLICY "conv_participants_insert" ON public.conversation_participants FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "conv_participants_update" ON public.conversation_participants FOR UPDATE USING (user_id = auth.uid());

-- MESSAGES
CREATE POLICY "messages_select" ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid())
);
CREATE POLICY "messages_insert" ON public.messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND EXISTS (SELECT 1 FROM public.conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid())
);
CREATE POLICY "messages_update" ON public.messages FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid())
);

-- GROUPS
CREATE POLICY "groups_select" ON public.groups FOR SELECT USING (
  visibility = 'public' OR owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.group_memberships WHERE group_id = id AND user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE)
);
CREATE POLICY "groups_insert" ON public.groups FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "groups_update" ON public.groups FOR UPDATE USING (
  owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.group_memberships WHERE group_id = id AND user_id = auth.uid() AND role IN ('owner','admin'))
);
CREATE POLICY "groups_delete" ON public.groups FOR DELETE USING (
  owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE)
);

-- GROUP MEMBERSHIPS
CREATE POLICY "group_memberships_select" ON public.group_memberships FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.visibility = 'public')
  OR EXISTS (SELECT 1 FROM public.group_memberships gm WHERE gm.group_id = group_id AND gm.user_id = auth.uid())
);
CREATE POLICY "group_memberships_insert" ON public.group_memberships FOR INSERT WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.groups WHERE id = group_id AND visibility = 'public')
);
CREATE POLICY "group_memberships_delete" ON public.group_memberships FOR DELETE USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.group_memberships gm WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.role IN ('owner','admin'))
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE)
);
CREATE POLICY "group_memberships_update" ON public.group_memberships FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.group_memberships gm WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.role IN ('owner','admin'))
);

-- NOTIFICATIONS
CREATE POLICY "notifications_select" ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "notifications_delete" ON public.notifications FOR DELETE USING (user_id = auth.uid());

-- SAVED POSTS
CREATE POLICY "saved_posts_select" ON public.saved_posts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "saved_posts_insert" ON public.saved_posts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "saved_posts_delete" ON public.saved_posts FOR DELETE USING (user_id = auth.uid());

-- CONTENT REPORTS
CREATE POLICY "content_reports_select" ON public.content_reports FOR SELECT USING (
  reporter_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE)
);
CREATE POLICY "content_reports_insert" ON public.content_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "content_reports_update" ON public.content_reports FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE)
);

-- MODERATION ACTIONS
CREATE POLICY "moderation_actions_select" ON public.moderation_actions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE)
);
CREATE POLICY "moderation_actions_insert" ON public.moderation_actions FOR INSERT WITH CHECK (
  auth.uid() = admin_id AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE)
);
