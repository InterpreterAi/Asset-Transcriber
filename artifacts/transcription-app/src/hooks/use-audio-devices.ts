import { useState, useEffect } from "react";

export interface AudioDevice {
  deviceId: string;
  label: string;
}

export function useAudioDevices() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      // Request permissions first
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices
        .filter((d) => d.kind === "audioinput")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.slice(0, 5)}...`,
        }));
      setDevices(audioInputs);
      setError(null);
    } catch (err) {
      setError("Microphone permission denied or not available.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
    navigator.mediaDevices.addEventListener("devicechange", fetchDevices);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", fetchDevices);
    };
  }, []);

  return { devices, loading, error, refresh: fetchDevices };
}
