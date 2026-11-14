export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type PostVisibility = "public" | "friends" | "only_me"
export type MessageAttachmentKind = "image" | "video" | "file"
export type FriendRequestStatus = "pending" | "accepted" | "rejected"
export type GroupRole = "owner" | "admin" | "member"
export type GroupVisibility = "public" | "private"
export type ReportStatus = "pending" | "reviewed" | "resolved" | "dismissed"
export type NotificationType =
  | "friend_request"
  | "friend_accepted"
  | "new_follower"
  | "post_reaction"
  | "post_comment"
  | "comment_reply"
  | "new_message"
  | "group_invite"
  | "group_joined"
  | "story_view"
  | "game_request"
  | "game_turn"

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          display_name: string
          avatar_url: string | null
          cover_url: string | null
          bio: string | null
          interests: string[] | null
          website: string | null
          location: string | null
          region?: string | null
          country?: string | null
          country_code?: string | null
          state?: string | null
          city?: string | null
          is_admin: boolean
          is_verified: boolean
          profile_visibility: "public" | "friends" | "private"
          created_at: string
          updated_at: string
          last_seen?: string | null
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["profiles"]["Row"], "created_at" | "updated_at">>
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>
      }
      posts: {
        Row: {
          id: string
          author_id: string
          content: string
          visibility: PostVisibility
          group_id: string | null
          is_shared: boolean
          shared_post_id: string | null
          reaction_count: number
          comment_count: number
          share_count: number
          created_at: string
          updated_at: string
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["posts"]["Row"], "id" | "reaction_count" | "comment_count" | "share_count" | "created_at" | "updated_at">>
        Update: Partial<Pick<Database["public"]["Tables"]["posts"]["Row"], "content" | "visibility" | "updated_at">>
      }
      post_media: {
        Row: {
          id: string
          post_id: string
          url: string
          type: "image" | "video" | "audio"
          position: number
          created_at: string
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["post_media"]["Row"], "id" | "created_at">>
        Update: Partial<Omit<Database["public"]["Tables"]["post_media"]["Row"], "id" | "post_id" | "created_at">>
      }
      reactions: {
        Row: {
          id: string
          user_id: string
          post_id: string | null
          comment_id: string | null
          type: string
          created_at: string
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["reactions"]["Row"], "id" | "created_at">>
        Update: Partial<Omit<Database["public"]["Tables"]["reactions"]["Row"], "id" | "created_at">>
      }
      comments: {
        Row: {
          id: string
          post_id: string
          author_id: string
          content: string
          parent_id: string | null
          reaction_count: number
          reply_count: number
          hidden?: boolean
          created_at: string
          updated_at: string
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["comments"]["Row"], "id" | "reaction_count" | "reply_count" | "hidden" | "created_at" | "updated_at">>
        Update: Partial<Pick<Database["public"]["Tables"]["comments"]["Row"], "content" | "hidden" | "updated_at">>
      }
      friend_requests: {
        Row: {
          id: string
          sender_id: string
          receiver_id: string
          status: FriendRequestStatus
          created_at: string
          updated_at: string
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["friend_requests"]["Row"], "id" | "created_at" | "updated_at">>
        Update: Partial<Pick<Database["public"]["Tables"]["friend_requests"]["Row"], "status" | "updated_at">>
      }
      friendships: {
        Row: {
          id: string
          user_id: string
          friend_id: string
          created_at: string
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["friendships"]["Row"], "id" | "created_at">>
        Update: never
      }
      followers: {
        Row: {
          id: string
          follower_id: string
          following_id: string
          created_at: string
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["followers"]["Row"], "id" | "created_at">>
        Update: never
      }
      stories: {
        Row: {
          id: string
          author_id: string
          media_url: string
          media_type: "image" | "video"
          caption: string | null
          expires_at: string
          view_count: number
          created_at: string
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["stories"]["Row"], "id" | "view_count" | "created_at">>
        Update: never
      }
      story_views: {
        Row: {
          id: string
          story_id: string
          viewer_id: string
          created_at: string
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["story_views"]["Row"], "id" | "created_at">>
        Update: never
      }
      conversations: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          last_message_at: string | null
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["conversations"]["Row"], "id" | "created_at" | "updated_at">>
        Update: Partial<Pick<Database["public"]["Tables"]["conversations"]["Row"], "last_message_at" | "updated_at">>
      }
      conversation_participants: {
        Row: {
          id: string
          conversation_id: string
          user_id: string
          last_read_at: string | null
          deleted_at: string | null
          created_at: string
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["conversation_participants"]["Row"], "id" | "created_at">>
        Update: Partial<Pick<Database["public"]["Tables"]["conversation_participants"]["Row"], "last_read_at" | "deleted_at">>
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          sender_id: string
          content: string
          is_read: boolean
          created_at: string
          attachment_url: string | null
          attachment_kind: MessageAttachmentKind | null
          attachment_name: string | null
          attachment_size: number | null
          view_once: boolean
          viewed_at: string | null
          edited_at: string | null
          deleted_at: string | null
          pinned_at: string | null
          pinned_by: string | null
          reply_to: string | null
          forwarded_from: string | null
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["messages"]["Row"], "id" | "is_read" | "created_at">>
        Update: Partial<Omit<Database["public"]["Tables"]["messages"]["Row"], "id" | "conversation_id" | "sender_id" | "created_at">>
      }
      groups: {
        Row: {
          id: string
          name: string
          description: string | null
          image_url: string | null
          visibility: GroupVisibility
          owner_id: string
          member_count: number
          created_at: string
          updated_at: string
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["groups"]["Row"], "id" | "member_count" | "created_at" | "updated_at">>
        Update: Partial<Pick<Database["public"]["Tables"]["groups"]["Row"], "name" | "description" | "image_url" | "visibility" | "updated_at">>
      }
      group_memberships: {
        Row: {
          id: string
          group_id: string
          user_id: string
          role: GroupRole
          created_at: string
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["group_memberships"]["Row"], "id" | "created_at">>
        Update: Partial<Pick<Database["public"]["Tables"]["group_memberships"]["Row"], "role">>
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          actor_id: string | null
          type: NotificationType
          entity_id: string | null
          entity_type: string | null
          message: string
          is_read: boolean
          created_at: string
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["notifications"]["Row"], "id" | "is_read" | "created_at">>
        Update: Partial<Pick<Database["public"]["Tables"]["notifications"]["Row"], "is_read">>
      }
      saved_posts: {
        Row: {
          id: string
          user_id: string
          post_id: string
          created_at: string
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["saved_posts"]["Row"], "id" | "created_at">>
        Update: never
      }
      user_blocks: {
        Row: {
          id: string
          blocker_id: string
          blocked_id: string
          created_at: string
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["user_blocks"]["Row"], "id" | "created_at">>
        Update: never
      }
      content_reports: {
        Row: {
          id: string
          reporter_id: string
          entity_id: string
          entity_type: "post" | "comment" | "profile" | "group"
          reason: string
          details: string | null
          status: ReportStatus
          reviewed_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["content_reports"]["Row"], "id" | "status" | "reviewed_by" | "created_at" | "updated_at">>
        Update: Partial<Pick<Database["public"]["Tables"]["content_reports"]["Row"], "status" | "reviewed_by" | "updated_at">>
      }
      user_preferences: {
        Row: {
          id: string
          user_id: string
          theme: "light" | "dark" | "system"
          notify_friend_requests: boolean
          notify_reactions: boolean
          notify_comments: boolean
          notify_messages: boolean
          notify_group_activity: boolean
          default_post_visibility: PostVisibility
          color_theme: ColorTheme
          created_at: string
          updated_at: string
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["user_preferences"]["Row"], "id" | "created_at" | "updated_at">>
        Update: Partial<Omit<Database["public"]["Tables"]["user_preferences"]["Row"], "id" | "user_id" | "created_at" | "updated_at">>
      }
      moderation_actions: {
        Row: {
          id: string
          admin_id: string
          target_user_id: string | null
          entity_id: string | null
          entity_type: string | null
          action: string
          reason: string | null
          created_at: string
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["moderation_actions"]["Row"], "id" | "created_at">>
        Update: never
      }
      site_content: {
        Row: {
          key: "terms" | "rules" | "privacy" | "about"
          title: string
          body: string
          updated_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["site_content"]["Row"], "updated_at">
        Update: Partial<Pick<Database["public"]["Tables"]["site_content"]["Row"], "title" | "body">>
      }
      site_settings: {
        Row: {
          key: string
          value: string
          updated_at: string
        }
        Insert: { key: string; value: string }
        Update: Partial<Pick<Database["public"]["Tables"]["site_settings"]["Row"], "value">>
      }
      external_games: {
        Row: {
          id: string
          title: string
          description: string | null
          play_url: string
          cover_url: string | null
          created_by: string | null
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["external_games"]["Row"], "id" | "created_at" | "created_by"> & { created_by?: string | null }
        Update: Partial<Omit<Database["public"]["Tables"]["external_games"]["Row"], "id" | "created_at">>
      }
      study_resources: {
        Row: {
          id: string
          title: string
          url: string
          cover_url: string | null
          description: string | null
          added_by: string | null
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["study_resources"]["Row"], "id" | "created_at">
        Update: Partial<Omit<Database["public"]["Tables"]["study_resources"]["Row"], "id" | "created_at">>
      }
      reel_embeds: {
        Row: {
          id: string
          platform: "tiktok" | "youtube"
          external_id: string
          caption: string | null
          created_by: string | null
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["reel_embeds"]["Row"], "id" | "created_at">
        Update: Partial<Omit<Database["public"]["Tables"]["reel_embeds"]["Row"], "id" | "created_at">>
      }
      site_shortcuts: {
        Row: {
          id: string
          category: "study" | "sports" | "betting" | "featured"
          name: string
          url: string
          logo_url: string | null
          description: string | null
          site_category: string | null
          published: boolean
          sort: number
          created_by: string | null
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["site_shortcuts"]["Row"], "id" | "created_at" | "logo_url" | "description" | "created_by" | "sort" | "site_category" | "published"> & { logo_url?: string | null; description?: string | null; created_by?: string | null; sort?: number; site_category?: string | null; published?: boolean }
        Update: Partial<Omit<Database["public"]["Tables"]["site_shortcuts"]["Row"], "id" | "created_at">>
      }
      live_sessions: {
        Row: {
          id: string
          user_id: string
          title: string
          status: "live" | "ended"
          started_at: string
          ended_at: string | null
          clip_seq: number
          clip_path: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["live_sessions"]["Row"], "id" | "started_at" | "ended_at" | "clip_seq" | "clip_path" | "created_at" | "updated_at" | "title" | "status"> & { title?: string; status?: "live" | "ended" }
        Update: Partial<Omit<Database["public"]["Tables"]["live_sessions"]["Row"], "id" | "user_id" | "created_at">>
      }
      study_books: {
        Row: {
          id: string
          category: "educational" | "story" | "inspirational" | "holy"
          title: string
          author: string | null
          pdf_url: string
          cover_url: string | null
          description: string | null
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["study_books"]["Row"], "id" | "created_at">
        Update: Partial<Omit<Database["public"]["Tables"]["study_books"]["Row"], "id" | "created_at">>
      }
      study_progress: {
        Row: {
          id: string
          user_id: string
          book_id: string
          position: number
          percent: number
          finished_at: string | null
          updated_at: string
        }
        Insert: { user_id: string; book_id: string; position?: number; percent?: number; finished_at?: string | null }
        Update: Partial<{ position: number; percent: number; finished_at: string | null; updated_at: string }>
      }
      study_book_highlights: {
        Row: {
          id: string
          user_id: string
          book_id: string
          paragraph: number
          start_char: number
          end_char: number
          created_at: string
        }
        Insert: { user_id: string; book_id: string; paragraph: number; start_char: number; end_char: number }
        Update: Partial<{ paragraph: number; start_char: number; end_char: number }>
      }
      game_scores: {
        Row: {
          id: string
          user_id: string
          game_id: string
          best: number
          points: number
          state: Json | null
          updated_at: string
        }
        Insert: { user_id: string; game_id: string; best?: number; points?: number; state?: Json | null }
        Update: Partial<{ best: number; points: number; state: Json | null; updated_at: string }>
      }
      game_requests: {
        Row: {
          id: string
          game: "whot" | "chess" | "ludo"
          challenger_id: string
          opponent_id: string
          status: "pending" | "accepted" | "declined" | "cancelled" | "done"
          state: Json | null
          turn: string | null
          winner_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["game_requests"]["Row"], "id" | "created_at" | "updated_at" | "status" | "state" | "turn" | "winner_id"> & {
          status?: "pending" | "accepted" | "declined" | "cancelled" | "done"
          state?: Json | null
          turn?: string | null
          winner_id?: string | null
        }
        Update: Partial<Omit<Database["public"]["Tables"]["game_requests"]["Row"], "id" | "challenger_id" | "opponent_id" | "created_at">>
      }
      account_upgrades: {
        Row: {
          id: string
          user_id: string
          amount: number
          reference: string
          status: "pending" | "approved" | "rejected"
          note: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["account_upgrades"]["Row"], "id" | "created_at" | "reviewed_by" | "reviewed_at"> & { status?: "pending" | "approved" | "rejected" }
        Update: Partial<Omit<Database["public"]["Tables"]["account_upgrades"]["Row"], "id" | "user_id" | "reference" | "created_at">>
      }
      bot_flags: {
        Row: {
          id: string
          entity_type: "post" | "comment"
          entity_id: string
          author_id: string | null
          matched_keyword: string | null
          excerpt: string | null
          action: "flag" | "hide"
          previous_visibility: PostVisibility | null
          previous_hidden: boolean | null
          open: boolean
          created_at: string
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: Omit<Database["public"]["Tables"]["bot_flags"]["Row"], "id" | "created_at" | "resolved_at" | "resolved_by">
        Update: Partial<Pick<Database["public"]["Tables"]["bot_flags"]["Row"], "action" | "open" | "resolved_at" | "resolved_by">>
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      unread_message_count: {
        Args: { p_user: string }
        Returns: number
      }
      bot_inspect: {
        Args: { p_entity_type: string; p_entity_id: string; p_content: string }
        Returns: string
      }
      bot_scan: {
        Args: { p_limit?: number }
        Returns: number
      }
      bot_hide: {
        Args: { p_flag_id: string }
        Returns: undefined
      }
      bot_restore: {
        Args: { p_flag_id: string }
        Returns: undefined
      }
      open_view_once: {
        Args: { p_message_id: string }
        Returns: { attachment_path: string; media_kind: MessageAttachmentKind; ttl_seconds: number }[]
      }
      delete_message_for_everyone: {
        Args: { p_message_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// Convenience row types
export type Profile = Database["public"]["Tables"]["profiles"]["Row"]
export type Post = Database["public"]["Tables"]["posts"]["Row"]
export type PostMedia = Database["public"]["Tables"]["post_media"]["Row"]
export type Reaction = Database["public"]["Tables"]["reactions"]["Row"]
export type Comment = Database["public"]["Tables"]["comments"]["Row"]
export type FriendRequest = Database["public"]["Tables"]["friend_requests"]["Row"]
export type Friendship = Database["public"]["Tables"]["friendships"]["Row"]
export type Follower = Database["public"]["Tables"]["followers"]["Row"]
export type Story = Database["public"]["Tables"]["stories"]["Row"]
export type StoryView = Database["public"]["Tables"]["story_views"]["Row"]
export type Conversation = Database["public"]["Tables"]["conversations"]["Row"]
export type ConversationParticipant = Database["public"]["Tables"]["conversation_participants"]["Row"]
export type Message = Database["public"]["Tables"]["messages"]["Row"]
export type Group = Database["public"]["Tables"]["groups"]["Row"]
export type GroupMembership = Database["public"]["Tables"]["group_memberships"]["Row"]
export type Notification = Database["public"]["Tables"]["notifications"]["Row"]
export type SavedPost = Database["public"]["Tables"]["saved_posts"]["Row"]
export type UserBlock = Database["public"]["Tables"]["user_blocks"]["Row"]
export type ContentReport = Database["public"]["Tables"]["content_reports"]["Row"]
export type UserPreferences = Database["public"]["Tables"]["user_preferences"]["Row"]
export type ModerationAction = Database["public"]["Tables"]["moderation_actions"]["Row"]
export type SiteContent = Database["public"]["Tables"]["site_content"]["Row"]
export type SiteSetting = Database["public"]["Tables"]["site_settings"]["Row"]
export type ExternalGame = Database["public"]["Tables"]["external_games"]["Row"]
export type StudyResource = Database["public"]["Tables"]["study_resources"]["Row"]
export type ReelEmbed = Database["public"]["Tables"]["reel_embeds"]["Row"]
export type SiteShortcut = Database["public"]["Tables"]["site_shortcuts"]["Row"]
export type LiveSession = Database["public"]["Tables"]["live_sessions"]["Row"]
export type StudyBook = Database["public"]["Tables"]["study_books"]["Row"]
export type StudyProgress = Database["public"]["Tables"]["study_progress"]["Row"]
export type StudyProgressInsert = Database["public"]["Tables"]["study_progress"]["Insert"]
export type StudyHighlight = Database["public"]["Tables"]["study_book_highlights"]["Row"]
export type StudyHighlightInsert = Database["public"]["Tables"]["study_book_highlights"]["Insert"]
export type GameScore = Database["public"]["Tables"]["game_scores"]["Row"]
export type GameRequest = Database["public"]["Tables"]["game_requests"]["Row"]
export type AccountUpgrade = Database["public"]["Tables"]["account_upgrades"]["Row"]
export type BotFlag = Database["public"]["Tables"]["bot_flags"]["Row"]
export type BotFlagWithAuthor = BotFlag & { author: MiniProfile | null }

export type BotSettings = { enabled: boolean; autoHide: boolean; keywords: string[] }

export type ColorTheme = "follow_site" | "connexa" | "crimson" | "ocean" | "violet" | "amber"

// Extended types with joins
export type MiniProfile = Pick<Profile, "id" | "username" | "display_name" | "avatar_url">

export type PostWithAuthor = Post & {
  author: Profile
  media: PostMedia[]
  user_reaction?: string | null
  is_saved?: boolean
  shared_post?: PostWithAuthor | null
  reaction_breakdown?: Record<string, number>
  reaction_faces?: MiniProfile[]
  preview_comments?: { id: string; content: string; created_at: string; author: MiniProfile }[]
  reposters?: MiniProfile[]
}

export type CommentWithAuthor = Comment & {
  author: Profile
  user_reaction?: string | null
  replies?: CommentWithAuthor[]
}

export type StoryWithAuthor = Story & {
  author: Profile
  has_viewed?: boolean
}

export type ConversationWithDetails = Conversation & {
  participants: (ConversationParticipant & { profile: Profile })[]
  last_message?: Message | null
  unread_count: number
}

export type NotificationWithActor = Notification & {
  actor?: Profile | null
}

export type GroupWithMembership = Group & {
  membership?: GroupMembership | null
  owner: Profile
}
