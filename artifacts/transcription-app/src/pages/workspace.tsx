import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { Mic2, LogOut, Settings, Play, Square, AlertTriangle, Clock } from "lucide-react";
import { Button, Card, Select } from "@/components/ui-components";
import { useAudioDevices } from "@/hooks/use-audio-devices";
import { useTranscription } from "@/hooks/use-transcription";
import { AudioMeter } from "@/components/AudioMeter";
import { FeedbackModal } from "@/components/FeedbackModal";
import { formatMinutes } from "@/lib/utils";

export default function Workspace() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading: userLoading, error: userError } = useGetMe({
    query: { retry: false }
  });
  const logoutMut = useLogout();
  
  const { devices } = useAudioDevices();
  const transcription = useTranscription();
  
  const [micId, setMicId] = useState("");
  const [systemId, setSystemId] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    if (userError) setLocation("/login");
  }, [userError, setLocation]);

  useEffect(() => {
    if (devices.length > 0 && !micId) setMicId(devices[0].deviceId);
  }, [devices, micId]);

  useEffect(() => {
    if (user?.trialExpired) {
      // Small delay so it doesn't pop immediately on render
      const timer = setTimeout(() => setShowFeedback(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [user?.trialExpired]);

  const handleLogout = async () => {
    await logoutMut.mutateAsync();
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    setLocation("/login");
  };

  const handleToggleRecording = () => {
    if (transcription.isRecording) {
      transcription.stop();
      // Invalidate to refresh usage limits
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } else {
      transcription.start(micId, systemId);
    }
  };

  if (userLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div></div>;
  if (!user) return null;

  const isLimitReached = user.minutesRemainingToday <= 0;
  const isBlocked = user.trialExpired || isLimitReached;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <FeedbackModal isOpen={showFeedback} onClose={() => setShowFeedback(false)} />

      {/* Top Navbar */}
      <header className="h-16 border-b border-white/10 bg-card/50 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center border border-primary/30">
            <Mic2 className="w-4 h-4 text-primary" />
          </div>
          <span className="font-display font-bold text-lg hidden sm:block">InterpretAI</span>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex flex-col items-end">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">Time Today</span>
              <span className="font-mono font-medium text-primary">
                {formatMinutes(user.minutesUsedToday)} / {formatMinutes(user.dailyLimitMinutes)}
              </span>
            </div>
            
            <div className="h-8 w-px bg-white/10"></div>
            
            <div className="flex flex-col items-end">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">Trial Status</span>
              {user.trialExpired ? (
                <span className="font-medium text-destructive">Expired</span>
              ) : (
                <span className="font-medium text-accent">{user.trialDaysRemaining} Days Left</span>
              )}
            </div>
          </div>

          <div className="h-8 w-px bg-white/10"></div>
          
          <div className="flex items-center gap-3">
            {user.isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => setLocation("/admin")}>
                <Settings className="w-4 h-4 mr-2" /> Admin
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-white">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Sidebar - Controls */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="p-5 space-y-5">
            <h3 className="font-display font-semibold text-lg flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" /> Settings
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Microphone Input</label>
                <Select value={micId} onChange={e => setMicId(e.target.value)} disabled={transcription.isRecording}>
                  {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                </Select>
                <AudioMeter level={transcription.micLevel} label="Mic Lvl" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">System/Caller Input (Optional)</label>
                <Select value={systemId} onChange={e => setSystemId(e.target.value)} disabled={transcription.isRecording}>
                  <option value="">None</option>
                  {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                </Select>
                {systemId && <AudioMeter level={transcription.systemLevel} label="Sys Lvl" />}
              </div>
            </div>

            <div className="h-px bg-white/10 w-full"></div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase">Source Lang</label>
                  <Select disabled={transcription.isRecording} defaultValue="en">
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase">Target Lang</label>
                  <Select disabled={transcription.isRecording} defaultValue="es">
                    <option value="es">Spanish</option>
                    <option value="en">English</option>
                    <option value="fr">French</option>
                  </Select>
                </div>
              </div>
            </div>

            <Button 
              className="w-full" 
              size="lg"
              variant={transcription.isRecording ? "destructive" : "default"}
              onClick={handleToggleRecording}
              disabled={isBlocked || transcription.isStarting}
              isLoading={transcription.isStarting}
            >
              {transcription.isRecording ? (
                <><Square className="w-5 h-5 mr-2 fill-current" /> Stop Session</>
              ) : (
                <><Play className="w-5 h-5 mr-2 fill-current" /> Start Session</>
              )}
            </Button>
          </Card>
        </div>

        {/* Right Area - Transcription */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          {user.trialExpired && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-destructive">Trial Expired</h4>
                <p className="text-sm text-destructive/80 mt-1">Your 14-day trial has concluded. Please contact support to upgrade your account and continue using the service.</p>
              </div>
            </div>
          )}

          {isLimitReached && !user.trialExpired && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-amber-500">Daily Limit Reached</h4>
                <p className="text-sm text-amber-500/80 mt-1">You have exhausted your daily transcription limit of {user.dailyLimitMinutes} minutes. This resets at midnight.</p>
              </div>
            </div>
          )}

          {transcription.error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-destructive text-sm">
              Error: {transcription.error}
            </div>
          )}

          <Card className="flex-1 min-h-[400px] flex flex-col overflow-hidden relative">
            <div className="bg-secondary/50 border-b border-white/5 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  {transcription.isRecording && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  )}
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${transcription.isRecording ? 'bg-red-500' : 'bg-muted'}`}></span>
                </span>
                <span className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Live Transcript</span>
              </div>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto font-mono text-lg leading-relaxed text-foreground/90 whitespace-pre-wrap">
              {transcription.transcript === "" && transcription.partialTranscript === "" && !transcription.isRecording ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground/50">
                  <Mic2 className="w-16 h-16 mb-4 opacity-20" />
                  <p>Click "Start Session" to begin transcribing</p>
                </div>
              ) : (
                <>
                  <span className="text-white">{transcription.transcript}</span>
                  {transcription.partialTranscript && (
                    <span className="text-white/50 bg-white/5 px-1 rounded ml-1 animate-pulse">
                      {transcription.partialTranscript}
                    </span>
                  )}
                </>
              )}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
