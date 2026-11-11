// The Help bot answers from this list only, so it can reply the moment a
// message is sent — no model call, no waiting, and nothing it cannot back up
// with a screen that actually exists in the app.

export const HELP_TOPICS: { keys: string[]; answer: string }[] = [
  {
    keys: ["hi", "hello", "hey", "good morning", "good afternoon", "good evening"],
    answer: "Hello! I'm the CONNEXA helper. Ask me how anything works — posting, stories, going live, games, the study room, chat, settings. Or tap a suggestion below.",
  },
  {
    keys: ["thank", "thanks", "appreciate"],
    answer: "Anytime. Ask me anything else about CONNEXA whenever you like.",
  },
  {
    keys: ["what can you", "who are you", "help", "what do you do", "features"],
    answer: "I answer questions about CONNEXA: Home (posts), Stories, Reels, Live, Games, Study, Groups, Messages, Saved, Notifications, Friends and Settings. Ask something like \"how do I go live?\" or \"where do I change the theme?\"",
  },
  {
    keys: ["post", "publish", "write something", "status", "upload a photo", "add a video"],
    answer: "Open Home and use the box at the top: type your post, add photos, video or a voice note, choose who can see it (Public, Friends or Only me) and press Post. Your own posts appear on your profile page.",
  },
  {
    keys: ["story", "stories", "24 hour", "snap"],
    answer: "Stories are in the left menu (and in the row at the top of Home). Tap \"Your story\", take or pick a photo or video, and it stays up for 24 hours. A green ring around someone's picture means you have not seen their story yet — the ring clears as soon as you do.",
  },
  {
    keys: ["go live", "live stream", "start live", "broadcast", "camera live"],
    answer: "Open Discover → Go live (or /live). Press \"Turn on camera\", then \"Start live session\": the screen goes full screen, your profile cover shows the broadcast to everyone while you are on, and it returns to your normal cover photo when you stop. You can share the recording to your feed afterwards.",
  },
  {
    keys: ["game", "games", "play", "arcade", "3d", "snake", "2048", "trending", "chess", "whot", "ludo", "checkers"],
    answer: "The Games tab holds eleven arcade games (Snake, Racing, 2048, Chess-style duels and more), Trending 3D games that open in full screen, and Live games where you challenge a friend to Whot, Chess or Ludo. Your best scores and points are saved to your profile.",
  },
  {
    keys: ["livescore", "live score", "flashscore", "sofascore", "football", "match", "result", "sport"],
    answer: "Tap any sports icon (Livescore, Flashscore, SofaScore, ESPN, BBC Sport, FotMob) on the Games tab and the fixture list opens inside CONNEXA — real live scores and results, refreshed every minute, with football, basketball, tennis, cricket and American football. There is a full-screen button on the board too.",
  },
  {
    keys: ["betting", "odds", "bet"],
    answer: "The betting icons on the Games tab open the bookmaker in a new tab — betting sites need their own login, so they cannot be shown inside CONNEXA. They are marked 18+ only.",
  },
  {
    keys: ["study", "book", "read", "library", "revision", "exam", "homework"],
    answer: "The Study tab is the Study Room: a 3D library you walk through to pick a book, then read it page by page inside the app. Your progress is saved per book, and the study site shortcuts below open revision resources.",
  },
  {
    keys: ["message", "chat", "dm", "inbox", "send a photo", "picture in chat", "attachment"],
    answer: "Messages lists your conversations with the newest on top. Inside a chat there are two attach buttons: the picture icon sends a photo straight from your device, the paperclip sends a video or document (PDF, Word, txt, zip). Threads you have not opened are marked with a green dot.",
  },
  {
    keys: ["view once", "disappearing", "secret photo"],
    answer: "Attach a photo or video in a chat and tick View once before sending. The other person gets one look: the file opens in a full-screen viewer for 60 seconds and cannot be opened again.",
  },
  {
    keys: ["delete a chat", "delete conversation", "remove chat"],
    answer: "In Messages, press the bin icon beside a conversation. It removes the chat for you only — the other person keeps their copy.",
  },
  {
    keys: ["friend", "add friend", "friend request", "follow", "unfollow", "block", "unblock"],
    answer: "Friends tab: send a request, and accept the ones waiting for you. On any profile you can Add friend, Follow, Message or Block. Blocked people cannot see your content, and unblocking is on the same profile.",
  },
  {
    keys: ["notification", "alert", "badge", "unread"],
    answer: "The Notifications tab (bell) collects likes, comments, friend requests and mentions, newest first. The number on the tab is what you have not read yet; opening the list clears it.",
  },
  {
    keys: ["saved", "bookmark"],
    answer: "Press the bookmark on any post to keep it. Everything you saved is under Saved in the menu.",
  },
  {
    keys: ["reel", "reels", "short video", "tiktok"],
    answer: "Reels is in the left menu: vertical short videos, including embedded ones. Post a short video from Home and it can appear there.",
  },
  {
    keys: ["group", "groups", "community"],
    answer: "Groups tab: create a group, invite friends and post inside it. Group posts are separate from your Home feed.",
  },
  {
    keys: ["profile", "cover photo", "avatar", "dp", "bio", "username", "edit profile"],
    answer: "Your profile page shows your posts and About details. \"Edit cover\" sits on the cover photo, and Settings → Edit profile handles your name, username, bio, avatar and cover.",
  },
  {
    keys: ["theme", "dark mode", "light mode", "appearance", "colouur", "color", "night"],
    answer: "Settings has Appearance: choose Light, Dark or Follow system, plus the colour theme. It applies everywhere at once, including the story rings and the live scoreboard.",
  },
  {
    keys: ["verify", "verified", "tick", "badge for", "upgrade", "credit", "pay"],
    answer: "Settings → Upgrade shows what verification costs and how to pay, then the request goes to an admin for approval. A gold tick appears on your name once it is approved.",
  },
  {
    keys: ["password", "email", "sign out", "log out", "login", "log in", "sign up", "register", "account", "delete my account"],
    answer: "Settings is the place for your account: sign in or up from the welcome screen, change your email or password, and delete your account there too.",
  },
  {
    keys: ["report", "spam", "spammer", "spamming", "harass", "harassment", "bullying", "rude", "inappropriate", "moderation", "flag"],
    answer: "Every post has a Report option, and moderators see the flags in the admin console. You can also report a person from their profile. For anything urgent, use the Help page (/help) or Contact.",
  },
  {
    keys: ["photo upload", "upload from device", "thumbnail", "cover upload"],
    answer: "Anywhere CONNEXA asks for a picture you can now either paste a link or press the image button to choose the file from your device — book covers, game thumbnails and site logos all accept both.",
  },
  {
    keys: ["slow", "fast", "loading", "lag", "performance"],
    answer: "Games load only the one you open, scores refresh once a minute in the background, and live clips are five seconds each, so nothing has to download the whole app to show you a screen. If a page feels slow, a refresh usually brings it back.",
  },
];

/** Best-matching answer for a message, or the "I don't know yet" reply. */
export function answerFor(text: string): string {
  const q = ` ${text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()} `;
  let best: { answer: string; score: number; longest: number } | null = null;
  for (const topic of HELP_TOPICS) {
    let score = 0;
    let longest = 0;
    for (const key of topic.keys) {
      const hit = key.includes(" ") ? q.includes(key) : q.includes(` ${key} `);
      if (!hit) continue;
      // Phrases count more than single words, and a longer word is a more
      // specific match, so "story" wins over "post" in "how do I post a story".
      score += key.includes(" ") ? 3 : 1;
      longest = Math.max(longest, key.length);
    }
    if (score === 0) continue;
    if (!best || score > best.score || (score === best.score && longest > best.longest)) {
      best = { answer: topic.answer, score, longest };
    }
  }
  if (best) return best.answer;
  return "I don't have that one yet. Try naming the part of CONNEXA you mean — posts, stories, live, games, study, messages, friends, saved, settings, verification — and I'll point you to the right screen.";
}

export const HELP_SUGGESTIONS = [
  "How do I go live?",
  "Where are the live scores?",
  "How do I send a photo in chat?",
  "How do I change the theme?",
  "What can you do?",
];

export function helpGreeting(displayName: string) {
  const first = displayName.split(" ")[0] || "there";
  return `Hi ${first}, I'm the CONNEXA helper. Ask me how anything works and I'll answer straight away — no waiting, no typing your problem twice.`;
}
