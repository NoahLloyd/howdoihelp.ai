"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export type VoiceRecorderState = "idle" | "recording" | "transcribing" | "error";

export interface UseVoiceRecorderOptions {
  onTranscribed: (text: string) => void;
  maxDurationMs?: number;
}

export interface UseVoiceRecorderResult {
  state: VoiceRecorderState;
  isSupported: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
}

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/wav",
] as const;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      // Some Safari builds throw — fall through.
    }
  }
  return undefined;
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("wav")) return "wav";
  return "bin";
}

function describeMediaError(err: unknown): string {
  const e = err as { name?: string; message?: string };
  switch (e?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone access was denied. Enable it in your browser settings.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No microphone was detected on this device.";
    case "NotReadableError":
      return "Your microphone is in use by another app. Close it and try again.";
    case "AbortError":
      return "Recording was interrupted. Please try again.";
    default:
      return "Couldn't start recording. Please try again or type instead.";
  }
}

async function transcribeBlob(blob: Blob, ext: string): Promise<string> {
  const fd = new FormData();
  fd.append("audio", blob, `voice.${ext}`);
  const res = await fetch("/api/transcribe", { method: "POST", body: fd });
  if (!res.ok) {
    let message = "Couldn't transcribe audio. Please try again.";
    try {
      const data = (await res.json()) as { error?: { code?: string; message?: string } };
      const code = data?.error?.code;
      if (code === "rate_limit_exceeded" || code === "upstream_rate_limit") {
        message = "Voice is busy right now. Try again in a moment.";
      } else if (code === "file_too_large") {
        message = "Recording was too long. Please keep it under a minute.";
      } else if (code === "empty_audio") {
        message = "We didn't catch that. Try recording again.";
      } else if (data?.error?.message) {
        message = data.error.message;
      }
    } catch {
      // ignore JSON parse failure
    }
    throw new Error(message);
  }
  const data = (await res.json()) as { text?: string };
  return (data.text || "").trim();
}

function subscribeNoop(): () => void {
  return () => {};
}

function getSupportedSnapshot(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (typeof navigator.mediaDevices?.getUserMedia !== "function") return false;
  if (typeof MediaRecorder === "undefined") return false;
  return pickMimeType() !== undefined;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useVoiceRecorder({
  onTranscribed,
  maxDurationMs = 60_000,
}: UseVoiceRecorderOptions): UseVoiceRecorderResult {
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [error, setError] = useState<string | null>(null);

  const isSupported = useSyncExternalStore(
    subscribeNoop,
    getSupportedSnapshot,
    getServerSnapshot
  );

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("audio/webm");
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortedRef = useRef(false);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const clearStopTimer = useCallback(() => {
    if (stopTimerRef.current != null) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    if (state !== "idle" && state !== "error") return;
    setError(null);
    abortedRef.current = false;

    const mimeType = pickMimeType();
    if (!mimeType) {
      setError("Voice isn't supported in this browser.");
      setState("error");
      return;
    }
    mimeTypeRef.current = mimeType;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setError(describeMediaError(err));
      setState("error");
      return;
    }
    streamRef.current = stream;

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch {
      releaseStream();
      setError("Couldn't start recording. Please try again or type instead.");
      setState("error");
      return;
    }
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onerror = () => {
      clearStopTimer();
      releaseStream();
      setError("Recording stopped unexpectedly.");
      setState("error");
    };

    recorder.onstop = async () => {
      clearStopTimer();
      releaseStream();
      const chunks = chunksRef.current;
      chunksRef.current = [];

      if (abortedRef.current) {
        setState("idle");
        return;
      }

      const blob = new Blob(chunks, { type: mimeTypeRef.current });
      if (blob.size === 0) {
        setError("We didn't catch that. Try recording again.");
        setState("error");
        return;
      }

      setState("transcribing");
      try {
        const text = await transcribeBlob(blob, extensionFor(mimeTypeRef.current));
        if (text) onTranscribed(text);
        setState("idle");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't transcribe audio.");
        setState("error");
      }
    };

    try {
      recorder.start();
    } catch (err) {
      releaseStream();
      setError(describeMediaError(err));
      setState("error");
      return;
    }

    setState("recording");

    stopTimerRef.current = setTimeout(() => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    }, maxDurationMs);
  }, [state, maxDurationMs, onTranscribed, releaseStream, clearStopTimer]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    abortedRef.current = true;
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    } else {
      releaseStream();
      setState("idle");
    }
  }, [releaseStream]);

  useEffect(() => {
    return () => {
      abortedRef.current = true;
      clearStopTimer();
      if (recorderRef.current?.state === "recording") {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      releaseStream();
    };
  }, [clearStopTimer, releaseStream]);

  return { state, isSupported, error, start, stop, cancel };
}
