import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Login from "./pages/login";
import Workspace from "./pages/workspace";
import Admin from "./pages/admin";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center p-4">
      <h1 className="text-6xl font-display font-bold text-white mb-4">404</h1>
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
      <Route path="/" component={Workspace} />
      <Route path="/login" component={Login} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
