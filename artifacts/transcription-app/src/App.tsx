import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { useGetMe } from "@workspace/api-client-react";
import Landing from "./pages/landing";
import Login from "./pages/login";
import Signup from "./pages/signup";
import ForgotPassword from "./pages/forgot-password";
import ResetPassword from "./pages/reset-password";
import Workspace from "./pages/workspace";
import Admin from "./pages/admin";
import Terms from "./pages/terms";
import Privacy from "./pages/privacy";
import InvitePage from "./pages/invite";

// ─── Maintenance banner toggle ────────────────────────────────────────────────
// Set to true  → banner is shown across every page.
// Set to false → banner disappears with no other changes required.
const MAINTENANCE_MODE = true;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function MaintenanceBanner() {
  if (!MAINTENANCE_MODE) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-amber-50 border-b border-amber-200 flex items-center justify-center px-4 py-2.5 shrink-0 z-50"
      style={{ minHeight: "44px" }}
    >
      <p className="text-sm text-amber-900 text-center leading-snug">
        <span className="font-semibold">⚠️ System Update In Progress</span>
        {" — "}
        We are currently improving the system. The app will continue working normally, but you may notice small adjustments during the next 1–2 hours. Thank you for your patience.
      </p>
    </div>
  );
}

function RootRedirect() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = useGetMe({ query: { retry: false } });

  useEffect(() => {
    if (isLoading) return;
    if (user) {
      setLocation("/workspace");
    }
  }, [user, isLoading, setLocation]);

  return <Landing />;
}

function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center p-4">
      <h1 className="text-6xl font-display font-bold text-foreground mb-4">404</h1>
      <p className="text-xl text-muted-foreground mb-8">This page doesn't exist.</p>
      <a href="/" className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
        Return Home
      </a>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRedirect} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/workspace" component={Workspace} />
      <Route path="/admin" component={Admin} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/invite" component={InvitePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex flex-col h-[100dvh] overflow-hidden isolate">
        <MaintenanceBanner />
        <div className="flex-1 min-h-0 overflow-y-auto">
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </div>
      </div>
    </QueryClientProvider>
  );
}

export default App;
