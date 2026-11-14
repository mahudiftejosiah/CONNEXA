"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Camera, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { LocationPicker, type PlaceSelection } from "@/components/ui/LocationPicker";
import { updateProfile, uploadAvatar, uploadCover } from "@/lib/actions/profile";
import type { Profile, UserPreferences } from "@/lib/supabase/types";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

interface EditProfileClientProps {
  profile: Profile;
  preferences: UserPreferences | null;
}

export function EditProfileClient({ profile, preferences }: EditProfileClientProps) {
  const router = useRouter();
  const avatarRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || "");
  const [coverUrl, setCoverUrl] = useState(profile.cover_url || "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    display_name: profile.display_name,
    username: profile.username,
    bio: profile.bio || "",
    website: profile.website || "",
    interests: (profile.interests || []).join(", "),
    profile_visibility: profile.profile_visibility,
  });

  // Location is no longer a sentence someone types: it is a chain of choices
  // that the server checks against the same world list the pickers show.
  const [place, setPlace] = useState<PlaceSelection>({
    region: profile.region || null,
    country: profile.country || null,
    country_code: profile.country_code || null,
    state: profile.state || null,
    state_code: null,
    city: profile.city || null,
  });

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    const fd = new FormData();
    fd.set("avatar", file);
    const res = await uploadAvatar(fd);
    setUploadingAvatar(false);
    if (res.error || !res.url) { toast.error(res.error ?? "Upload failed."); return; }
    setAvatarUrl(res.url);
    toast.success("Profile photo updated!");
  }

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    const fd = new FormData();
    fd.set("cover", file);
    const res = await uploadCover(fd);
    setUploadingCover(false);
    if (res.error || !res.url) { toast.error(res.error ?? "Upload failed."); return; }
    setCoverUrl(res.url);
    toast.success("Cover photo updated!");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.set(k, v));
    fd.set("country_code", place.country_code || "");
    fd.set("state_code", place.state_code || "");
    fd.set("city", place.city || "");
    const res = await updateProfile(fd);
    setSaving(false);
    if (res.error) {
      if (res.error.includes("Username")) setErrors({ username: res.error });
      else if (res.error.includes("Display")) setErrors({ display_name: res.error });
      else if (res.error.includes("place")) setErrors({ location: res.error });
      else toast.error(res.error);
      return;
    }
    toast.success("Profile saved!");
    router.push(`/profile/${res.username}`);
  }

  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.display_name)}&size=200&background=12372A&color=D6B875`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">Edit Profile</h1>
      </div>

      {/* Cover photo */}
      <div className="card overflow-hidden">
        <div className="relative h-40 bg-gradient-to-br from-brand-green-800 to-brand-green-600 group cursor-pointer" onClick={() => coverRef.current?.click()}>
          {coverUrl && <Image src={coverUrl} alt="Cover" fill className="object-cover" sizes="100vw" />}
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
            {uploadingCover
              ? <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Camera className="w-8 h-8 text-white" />}
          </div>
          <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
        </div>

        {/* Avatar */}
        <div className="px-4 pb-4 -mt-10 flex items-end gap-4">
          <div className="relative w-fit cursor-pointer" onClick={() => avatarRef.current?.click()}>
            <div className="w-20 h-20 rounded-full border-4 border-[var(--bg-card)] overflow-hidden bg-[var(--border)] relative group">
              <Image src={avatarUrl || fallbackAvatar} alt="Avatar" fill className="object-cover" sizes="80px" unoptimized={!avatarUrl} />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                {uploadingAvatar
                  ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Camera className="w-5 h-5 text-white" />}
              </div>
            </div>
            <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <p className="text-sm text-[var(--text-secondary)] pb-2">Click photos to change</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSave} className="card p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Display name"
            type="text"
            value={form.display_name}
            onChange={set("display_name")}
            error={errors.display_name}
            maxLength={80}
            required
          />
          <Input
            label="Username"
            type="text"
            value={form.username}
            onChange={set("username")}
            error={errors.username}
            hint="3–30 chars: letters, numbers, underscore"
            maxLength={30}
            required
          />
        </div>

        <Textarea
          label="Bio"
          value={form.bio}
          onChange={set("bio")}
          rows={3}
          placeholder="Tell people about yourself…"
          maxLength={500}
        />

        <Input label="Website" type="url" value={form.website} onChange={set("website")} placeholder="https://yoursite.com" />

        <div className="space-y-3">
          <div>
            <p className="label mb-0">Location</p>
            <p className="text-xs -mt-0.5" style={{ color: "var(--text-secondary)" }}>
              Pick a region and a country. The state and city appear once a country is chosen, and neither is required.
            </p>
          </div>
          <LocationPicker
            saved={{
              region: profile.region,
              country: profile.country,
              country_code: profile.country_code,
              state: profile.state,
              city: profile.city,
            }}
            onChange={setPlace}
          />
          {errors.location && <p className="text-xs text-red-500">{errors.location}</p>}
          {profile.location && !place.country && (
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Your profile still shows “{profile.location}”. Choosing a country above replaces it.
            </p>
          )}
        </div>

        <Input
          label="Interests"
          type="text"
          value={form.interests}
          onChange={set("interests")}
          placeholder="Music, Travel, Tech (comma-separated)"
          hint="Up to 20 interests, separated by commas"
        />

        <div>
          <label className="label">Profile visibility</label>
          <select value={form.profile_visibility} onChange={set("profile_visibility")} className="input">
            <option value="public">Public — anyone can view</option>
            <option value="friends">Friends — only friends can view</option>
            <option value="private">Private — only you</option>
          </select>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={saving} icon={<Save className="w-4 h-4" />} className="flex-1 sm:flex-none">
            Save changes
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
