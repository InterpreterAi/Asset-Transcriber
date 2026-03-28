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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#f5f5f7]">
      {/* Subtle Background Pattern */}
      <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-[400px] px-4 relative z-10"
      >
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-border">
            <Mic2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-display font-semibold text-foreground mb-2 tracking-tight">InterpretAI</h1>
          <p className="text-muted-foreground text-sm">Professional Transcription & Translation</p>
        </div>

        <Card className="p-8 bg-white border border-border shadow-md rounded-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-xl border border-destructive/20 text-center font-medium">
                {error}
              </div>
            )}
            
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Username</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground" />
                <Input 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username" 
                  className="pl-10 h-12 bg-gray-50 border-gray-200 focus-visible:ring-primary/20 focus-visible:border-primary"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground" />
                <Input 
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" 
                  className="pl-10 h-12 bg-gray-50 border-gray-200 focus-visible:ring-primary/20 focus-visible:border-primary"
                  required
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 mt-4 shadow-sm" 
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
