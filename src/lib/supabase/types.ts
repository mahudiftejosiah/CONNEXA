export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type PostVisibility = "public" | "friends" | "only_me"
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
          is_admin: boolean
          is_verified: boolean
          profile_visibility: "public" | "friends" | "private"
          created_at: string
          updated_at: string
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
          created_at: string
          updated_at: string
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["comments"]["Row"], "id" | "reaction_count" | "reply_count" | "created_at" | "updated_at">>
        Update: Partial<Pick<Database["public"]["Tables"]["comments"]["Row"], "content" | "updated_at">>
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
          created_at: string
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["conversation_participants"]["Row"], "id" | "created_at">>
        Update: Partial<Pick<Database["public"]["Tables"]["conversation_participants"]["Row"], "last_read_at">>
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          sender_id: string
          content: string
          is_read: boolean
          created_at: string
        }
        Insert: Partial<Omit<Database["public"]["Tables"]["messages"]["Row"], "id" | "is_read" | "created_at">>
        Update: Partial<Pick<Database["public"]["Tables"]["messages"]["Row"], "is_read">>
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      unread_message_count: {
        Args: { p_user: string }
        Returns: number
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
