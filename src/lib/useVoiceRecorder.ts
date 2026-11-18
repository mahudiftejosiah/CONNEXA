"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const MAX_VOICE_SECONDS = 120;

export type VoiceDraft = { file: File; url: string; seconds: number };

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const type of options) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

// Recording stays in the browser until the sender presses send: stopping hands
// back a draft with its own object URL so it can be played before it leaves.
export function useVoiceRecorder(onDraft: (draft: VoiceDraft) => void, onError: (message: string) => void) {
  const [recording, setRecording] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startedRef = useRef(0);
  const requestRef = useRef(0);
  const discardedRef = useRef(false);
  const draftRef = useRef(onDraft);
  const errorRef = useRef(onError);
  draftRef.current = onDraft;
  errorRef.current = onError;

  const release = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (audioCtxRef.current) { void audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => () => release(), [release]);

  const stop = useCallback((discard: boolean) => {
    requestRef.current++;
    setRequesting(false);
    discardedRef.current = discard;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else release();
    setRecording(false);
  }, [release]);

  const start = useCallback(async () => {
    if (recording || requesting) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      errorRef.current("This browser cannot record audio. Try Chrome, Edge or Safari.");
      return;
    }
    const ticket = ++requestRef.current;
    setRequesting(true);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      setRequesting(false);
      const name = (err as { name?: string })?.name;
      errorRef.current(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access was blocked. Allow it in your browser's site settings and try again."
          : name === "NotFoundError"
            ? "No microphone was found on this device."
            : "The microphone could not be opened."
      );
      return;
    }

    // The sender may have pressed Cancel while the permission prompt was open.
    if (ticket !== requestRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      setRequesting(false);
      return;
    }
    setRequesting(false);

    streamRef.current = stream;
    const mime = pickMime();
    let recorder: MediaRecorder;
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      errorRef.current("This browser cannot record audio in a format CONNEXA can send.");
      return;
    }

    chunksRef.current = [];
    discardedRef.current = false;
    recorderRef.current = recorder;
    startedRef.current = Date.now();

    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
    recorder.onstop = () => {
      const elapsed = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000));
      const type = recorder.mimeType || mime || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      release();
      if (discardedRef.current || blob.size === 0) return;
      if (elapsed < 1) { errorRef.current("That recording was too short. Hold on a moment longer."); return; }
      const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
      const file = new File([blob], `voice-note.${ext}`, { type });
      draftRef.current({ file, url: URL.createObjectURL(blob), seconds: elapsed });
    };

    // A live meter, so the sender can see the microphone is actually hearing them.
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      try {
        const ctx = new Ctor();
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (let i = 0; i < data.length; i++) {
            const v = Math.abs(data[i] - 128) / 128;
            if (v > peak) peak = v;
          }
          setLevel(Math.min(1, peak * 2.2));
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        /* Metering is a nicety; recording continues without it. */
      }
    }

    recorder.start(250);
    setRecording(true);
    setSeconds(0);
    timerRef.current = setInterval(() => {
      const elapsed = Math.round((Date.now() - startedRef.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_VOICE_SECONDS) stop(false);
    }, 250);
  }, [recording, requesting, release, stop]);

  return { recording, requesting, seconds, level, start, stop };
}