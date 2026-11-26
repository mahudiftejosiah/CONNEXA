"use client";

import { useState, useRef } from "react";
import { CheckCircle, ChevronRight, Upload, X, User, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { GenderSilhouette } from "@/components/ui/GenderSilhouette";
import { updateProfile, uploadAvatar, uploadCover } from "@/lib/actions/profile";
import type { Profile } from "@/lib/supabase/types";
import toast from "react-hot-toast";
import Image from "next/image";

interface OnboardingModalProps {
  profile: Profile;
  onComplete: (updated: Partial<Profile>) => void;
}

type Step = "gender" | "avatar" | "cover" | "bio" | "done";

const STEPS: Step[] = ["gender", "avatar", "cover", "bio", "done"];
const STEP_LABELS: Record<Step, string> = {
  gender: "Your gender",
  avatar: "Profile photo",
  cover:  "Cover photo",
  bio:    "About you",
  done:   "All set!",
};

export function OnboardingModal({ profile, onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState<Step>("gender");
  const [gender, setGender] = useState<"male" | "female" | null>(
    (profile.gender === "male" || profile.gender === "female") ? profile.gender : null
  );
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || "");
  const [coverUrl, setCoverUrl] = useState(profile.cover_url || "");
  const [bio, setBio] = useState(profile.bio || "");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const stepIndex = STEPS.indexOf(step);
  const progress = Math.round((stepIndex / (STEPS.length - 1)) * 100);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    const fd = new FormData();
    fd.set("avatar", file);
    const res = await uploadAvatar(fd);
    setUploadingAvatar(false);
    if (res.error || !res.url) { toast.error(res.error ?? "Upload failed."); return; }
    setAvatarUrl(res.url);
    toast.success("Photo uploaded!");
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    const fd = new FormData();
    fd.set("cover", file);
    const res = await uploadCover(fd);
    setUploadingCover(false);
    if (res.error || !res.url) { toast.error(res.error ?? "Upload failed."); return; }
    setCoverUrl(res.url);
    toast.success("Cover photo uploaded!");
  }

  async function handleContinue() {
    if (step === "gender") {
      if (!gender) return; // button is disabled, but guard anyway
      // Save gender immediately — it's mandatory
      const fd = new FormData();
      fd.set("display_name", profile.display_name);
      fd.set("username", profile.username);
      fd.set("profile_visibility", profile.profile_visibility);
      fd.set("gender", gender);
      await updateProfile(fd);
      setStep("avatar");
      return;
    }
    if (step === "avatar") { setStep("cover"); return; }
    if (step === "cover")  { setStep("bio");   return; }
    if (step === "bio") {
      // Save bio + mark onboarding done
      setSaving(true);
      const fd = new FormData();
      fd.set("display_name", profile.display_name);
      fd.set("username", profile.username);
      fd.set("profile_visibility", profile.profile_visibility);
      fd.set("gender", gender!);
      fd.set("bio", bio.trim());
      fd.set("onboarding_done", "true");
      await updateProfile(fd);
      setSaving(false);
      setStep("done");
      return;
    }
    if (step === "done") {
      onComplete({ gender: gender ?? undefined, avatar_url: avatarUrl, cover_url: coverUrl, bio });
    }
  }

  async function handleSkip() {
    // Can never skip gender — button not shown on that step
    if (step === "avatar") { setStep("cover"); return; }
    if (step === "cover")  { setStep("bio");   return; }
    if (step === "bio") {
      // Skip bio but still mark onboarding done
      setSaving(true);
      const fd = new FormData();
      fd.set("display_name", profile.display_name);
      fd.set("username", profile.username);
      fd.set("profile_visibility", profile.profile_visibility);
      fd.set("gender", gender!);
      fd.set("onboarding_done", "true");
      await updateProfile(fd);
      setSaving(false);
      setStep("done");
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}>
      <div className="card w-full max-w-md overflow-hidden animate-slide-up">

        {/* Header */}
        <div className="p-6 pb-0">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-extrabold" style={{ color: "var(--text-primary)" }}>
              {step === "done" ? "🎉 You're all set!" : "Welcome to CONNEXA!"}
            </h2>
            {step !== "gender" && step !== "done" && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ background: "rgba(214,184,117,0.15)", color: "#D6B875" }}>
                Step {stepIndex} of {STEPS.length - 2}
              </span>
            )}
          </div>
          <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
            {step === "gender" && "Let's personalise your profile so friends can recognise you."}
            {step === "avatar" && "Add a profile picture so people know it's you."}
            {step === "cover"  && "Add a cover photo to personalise your profile page."}
            {step === "bio"    && "Tell people a little about yourself."}
            {step === "done"   && "Your CONNEXA profile is taking shape!"}
          </p>

          {/* Progress bar */}
          {step !== "done" && (
            <div className="h-1.5 w-full rounded-full mb-5" style={{ background: "var(--border)" }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: "#D6B875" }} />
            </div>
          )}
        </div>

        {/* Step content */}
        <div className="px-6 pb-6">

          {/* STEP 1 — Gender */}
          {step === "gender" && (
            <div className="space-y-3">
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                What's your gender? <span className="text-red-500">*</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(["male", "female"] as const).map((g) => (
                  <button key={g} onClick={() => setGender(g)}
                    className="relative flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all duration-200"
                    style={{
                      borderColor: gender === g ? "#12372A" : "var(--border)",
                      background: gender === g ? "rgba(18,55,42,0.06)" : "var(--bg)",
                    }}>
                    <div className="w-16 h-16 rounded-full overflow-hidden"
                      style={{ background: "var(--border)" }}>
                      <GenderSilhouette gender={g} className="w-full h-full" />
                    </div>
                    <span className="font-semibold capitalize text-sm" style={{ color: "var(--text-primary)" }}>{g}</span>
                    {gender === g && (
                      <span className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: "#12372A" }}>
                        <CheckCircle className="w-3.5 h-3.5 text-white" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                You can change this later in Settings.
              </p>
            </div>
          )}

          {/* STEP 2 — Avatar */}
          {step === "avatar" && (
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-28 h-28 rounded-full overflow-hidden cursor-pointer group"
                style={{ background: "var(--border)" }}
                onClick={() => avatarRef.current?.click()}>
                {avatarUrl ? (
                  <Image src={avatarUrl} alt="Your photo" fill className="object-cover" sizes="112px" />
                ) : (
                  <GenderSilhouette gender={gender} className="w-full h-full" />
                )}
                <div className="absolute inset-0 flex items-center justify-center rounded-full transition-opacity opacity-0 group-hover:opacity-100"
                  style={{ background: "rgba(0,0,0,0.4)" }}>
                  {uploadingAvatar
                    ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Upload className="w-6 h-6 text-white" />}
                </div>
              </div>
              <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              <Button variant="outline" size="sm" icon={<User className="w-4 h-4" />}
                onClick={() => avatarRef.current?.click()} loading={uploadingAvatar}>
                {avatarUrl ? "Change photo" : "Upload photo"}
              </Button>
              {avatarUrl && (
                <button onClick={() => setAvatarUrl("")} className="text-xs flex items-center gap-1"
                  style={{ color: "var(--text-secondary)" }}>
                  <X className="w-3 h-3" /> Remove photo
                </button>
              )}
            </div>
          )}

          {/* STEP 3 — Cover */}
          {step === "cover" && (
            <div className="space-y-3">
              <div className="relative h-32 rounded-xl overflow-hidden cursor-pointer group"
                style={{ background: "linear-gradient(135deg, #12372A, #1f573a)" }}
                onClick={() => coverRef.current?.click()}>
                {coverUrl && (
                  <Image src={coverUrl} alt="Cover" fill className="object-cover" sizes="400px" />
                )}
                <div className="absolute inset-0 flex items-center justify-center transition-opacity"
                  style={{ background: "rgba(0,0,0,0.3)", opacity: coverUrl ? 0 : 1 }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = "1"}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = coverUrl ? "0" : "1"}>
                  {uploadingCover
                    ? <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Upload className="w-8 h-8 text-white" />}
                </div>
              </div>
              <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
              <Button variant="outline" size="sm" icon={<ImageIcon className="w-4 h-4" />}
                onClick={() => coverRef.current?.click()} loading={uploadingCover} className="w-full">
                {coverUrl ? "Change cover photo" : "Upload cover photo"}
              </Button>
            </div>
          )}

          {/* STEP 4 — Bio */}
          {step === "bio" && (
            <div className="space-y-2">
              <label className="label">About you <span className="font-normal text-xs" style={{ color: "var(--text-secondary)" }}>(optional)</span></label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell people about yourself, your interests, what you do…"
                maxLength={500}
                rows={4}
                className="input resize-none"
                aria-label="Bio"
              />
              <p className="text-xs text-right" style={{ color: "var(--text-secondary)" }}>{bio.length}/500</p>
            </div>
          )}

          {/* STEP 5 — Done */}
          {step === "done" && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-20 h-20 rounded-full overflow-hidden border-4"
                style={{ borderColor: "#D6B875" }}>
                {avatarUrl
                  ? <Image src={avatarUrl} alt={profile.display_name} width={80} height={80} className="object-cover" />
                  : <GenderSilhouette gender={gender} className="w-full h-full" />}
              </div>
              <div>
                <p className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>{profile.display_name}</p>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>@{profile.username}</p>
              </div>
              <div className="w-full h-1.5 rounded-full" style={{ background: "var(--border)" }}>
                <div className="h-full w-full rounded-full" style={{ background: "#D6B875" }} />
              </div>
              <p className="text-sm font-medium" style={{ color: "#D6B875" }}>Profile complete!</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 mt-6">
            <Button
              onClick={handleContinue}
              disabled={step === "gender" && !gender}
              loading={saving}
              className="flex-1"
              icon={step === "done" ? undefined : <ChevronRight className="w-4 h-4" />}
            >
              {step === "done" ? "Continue to CONNEXA" : "Continue"}
            </Button>
            {step !== "gender" && step !== "done" && (
              <Button variant="ghost" onClick={handleSkip} disabled={saving}>
                Skip
              </Button>
            )}
          </div>

          {step === "gender" && (
            <p className="text-xs text-center mt-3" style={{ color: "var(--text-secondary)" }}>
              Gender selection is required to continue.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
