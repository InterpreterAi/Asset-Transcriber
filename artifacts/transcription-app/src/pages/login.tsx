import { useState } from "react";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Mic2, Lock, User } from "lucide-react";
import { Button, Input, Card } from "@/components/ui-components";

export default function Login() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const loginMut = useLogin();
  
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await loginMut.mutateAsync({ data: { username, password } });
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setLocation("/");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Invalid credentials");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
      {/* Background Image/Gradient */}
      <div className="absolute inset-0 z-0">
        <img 
          src={`${import.meta.env.BASE_URL}images/auth-bg.png`} 
          alt="Abstract Background" 
          className="w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/80 to-background"></div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md px-4 relative z-10"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6 backdrop-blur-md border border-primary/20 shadow-lg shadow-primary/20">
            <Mic2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-display font-bold text-white mb-2">InterpretAI</h1>
          <p className="text-muted-foreground">Professional Transcription Proxy</p>
        </div>

        <Card className="p-8 backdrop-blur-2xl bg-card/40 border-white/5">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-destructive/20 text-destructive text-sm p-3 rounded-lg border border-destructive/30 text-center">
                {error}
              </div>
            )}
            
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider ml-1">USERNAME</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username" 
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider ml-1">PASSWORD</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" 
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full mt-6" 
              size="lg"
              isLoading={loginMut.isPending}
            >
              Sign In
            </Button>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
