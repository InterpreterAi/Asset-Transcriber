import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Redirect, Route, Switch, Router as WouterRouter } from 'wouter';

import { Navbar } from '@/components/layout/Navbar';
import { AppErrorBoundary } from '@/components/layout/AppErrorBoundary';
import Studio from '@/pages/studio';
import Library from '@/pages/library';
import OutroExportPage from '@/pages/outro-export';

const queryClient = new QueryClient();

function Router() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/30 selection:text-primary">
      <Navbar />
      <main className="flex-1 flex flex-col">
        <Switch>
          <Route path="/studio/new" component={Studio} />
          <Route path="/studio/:id" component={Studio} />
          <Route path="/studio" component={Studio} />
          <Route path="/" component={Studio} />
          <Route path="/library" component={Library} />
          <Route path="/outro" component={OutroExportPage} />
          <Route path="/builder/:id">
            {(params) => <Redirect to={`/studio/${params.id}`} />}
          </Route>
          <Route path="/builder">
            <Redirect to={`/studio/new?fresh=1&t=${Date.now()}`} />
          </Route>
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export default App;
