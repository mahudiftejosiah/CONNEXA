export type StickerCategory = "greetings" | "feelings" | "celebrate";

export type Sticker = { id: string; label: string; category: StickerCategory; url: string };

export const STICKER_CATEGORIES: { key: StickerCategory; label: string }[] = [
  { key: "greetings", label: "Greetings" },
  { key: "feelings", label: "Feelings" },
  { key: "celebrate", label: "Celebrate" },
];

// Stickers are public artwork, so a message carries the path itself rather than
// a private storage object. Nothing about them needs signing or a new table.
export const STICKERS: Sticker[] = [
  { id: "wave", label: "Hi", category: "greetings", url: "/stickers/wave.svg" },
  { id: "hello", label: "Hello", category: "greetings", url: "/stickers/hello.svg" },
  { id: "sun", label: "Morning", category: "greetings", url: "/stickers/sun.svg" },
  { id: "peace", label: "Peace", category: "greetings", url: "/stickers/peace.svg" },
  { id: "love", label: "Love", category: "feelings", url: "/stickers/love.svg" },
  { id: "happy", label: "Yay", category: "feelings", url: "/stickers/happy.svg" },
  { id: "cool", label: "Cool", category: "feelings", url: "/stickers/cool.svg" },
  { id: "laugh", label: "Laugh", category: "feelings", url: "/stickers/laugh.svg" },
  { id: "sad", label: "Aww", category: "feelings", url: "/stickers/sad.svg" },
  { id: "wow", label: "Wow", category: "feelings", url: "/stickers/wow.svg" },
  { id: "sleepy", label: "Sleepy", category: "feelings", url: "/stickers/sleepy.svg" },
  { id: "angry", label: "Grr", category: "feelings", url: "/stickers/angry.svg" },
  { id: "party", label: "Party", category: "celebrate", url: "/stickers/party.svg" },
  { id: "star", label: "Nice", category: "celebrate", url: "/stickers/star.svg" },
  { id: "fire", label: "Fire", category: "celebrate", url: "/stickers/fire.svg" },
  { id: "clap", label: "Bravo", category: "celebrate", url: "/stickers/clap.svg" },
];

export function isStickerPath(path?: string | null) {
  return !!path && path.startsWith("/stickers/");
}

// A voice note rides the existing file attachment, marked by its name so the
// bubble knows to draw a player instead of a download link.
export const VOICE_PREFIX = "voice-note";

export function isVoiceNote(name?: string | null) {
  return !!name && name.startsWith(VOICE_PREFIX);
}