import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Only allow same-origin relative paths as redirect targets (blocks open redirects). */
export function safeRedirectPath(path: string | null | undefined, fallback = "/feed"): string {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes(":\\")) {
    return fallback;
  }
  return path;
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

export function formatMessageTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return `Yesterday ${format(d, "HH:mm")}`;
  return format(d, "MMM d, HH:mm");
}

export function formatJoinDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "MMMM yyyy");
}

export function getAvatarUrl(name: string, size = 80): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=${size}&background=12372A&color=D6B875&bold=true`;
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "…";
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? `${count} ${singular}` : `${count} ${plural ?? singular + "s"}`;
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg"];
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
export const MAX_STORY_SIZE = 50 * 1024 * 1024; // 50MB

export function isValidImageType(type: string): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(type);
}

export function isValidVideoType(type: string): boolean {
  return ACCEPTED_VIDEO_TYPES.includes(type);
}

export function bytesToMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
