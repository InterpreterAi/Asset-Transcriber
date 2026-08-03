import { useState, useEffect, useCallback } from "react";

export interface AudioDevice {
  deviceId: string;
  label: string;
}

export function useAudioDevices() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      setLoading(true);
      // Permission unlocks device labels; still enumerate if this fails.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        /* permission may already be granted, or denied — still try enumerate */
      }

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices
        .filter((d) => d.kind === "audioinput")
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${i + 1}`,
        }))
        // Drop empty-id placeholders browsers sometimes return before permission
        .filter((d) => d.deviceId);

      setDevices(audioInputs);
      setError(
        audioInputs.length === 0
          ? "No microphones found. Allow mic access and refresh."
          : null,
      );
    } catch (err) {
      setDevices([]);
      setError("Microphone permission denied or not available.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDevices();
    const onChange = () => {
      void fetchDevices();
    };
    navigator.mediaDevices?.addEventListener("devicechange", onChange);
    return () => {
      navigator.mediaDevices?.removeEventListener("devicechange", onChange);
    };
  }, [fetchDevices]);

  return { devices, loading, error, refresh: fetchDevices };
}
