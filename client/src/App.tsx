import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import PlayerDashboard from "./components/PlayerDashboard";
import PlayerManagement from "./components/PlayerManagement";
import TeamPage from "./components/TeamPage";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

function WorkspaceRoute({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

function Router() {
  return (
    <Switch>
      <Route path="/player"><WorkspaceRoute><PlayerDashboard /></WorkspaceRoute></Route>
      <Route path="/players"><WorkspaceRoute><PlayerManagement /></WorkspaceRoute></Route>
      <Route path="/team/:teamId"><WorkspaceRoute><TeamPage /></WorkspaceRoute></Route>
      <Route path="/"><WorkspaceRoute><Home /></WorkspaceRoute></Route>
      <Route path="/leagues"><WorkspaceRoute><Home /></WorkspaceRoute></Route>
      <Route path="/teams"><WorkspaceRoute><Home /></WorkspaceRoute></Route>
      <Route path="/fixtures"><WorkspaceRoute><Home /></WorkspaceRoute></Route>
      <Route path="/results"><WorkspaceRoute><Home /></WorkspaceRoute></Route>
      <Route path="/table"><WorkspaceRoute><Home /></WorkspaceRoute></Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster position="top-right" /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
export default App;
