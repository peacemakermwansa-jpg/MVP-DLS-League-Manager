import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  LogIn,
  LogOut,
  PanelLeft,
  ShieldCheck,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const menuItems = [
  { icon: LayoutDashboard, label: "Overview", path: "/" },
  { icon: Trophy, label: "Leagues", path: "/leagues" },
  { icon: Users, label: "Teams", path: "/teams" },
  { icon: CalendarDays, label: "Fixtures", path: "/fixtures" },
  { icon: ClipboardCheck, label: "Results", path: "/results" },
  { icon: ShieldCheck, label: "League table", path: "/table" },
  { icon: UserRound, label: "My player centre", path: "/player" },
  { icon: Users, label: "Player register", path: "/players" },
];

const SIDEBAR_WIDTH_KEY = "mvp-sidebar-width";
const DEFAULT_WIDTH = 254;
const MIN_WIDTH = 210;
const MAX_WIDTH = 360;

type DashboardLayoutProps = { children: React.ReactNode };

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) return <AuthScreen />;

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({ children, setSidebarWidth }: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const isMobile = useIsMobile();
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find((item) => item.path === location);
  const displayName = user?.name || "League administrator";
  const initials = displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizing) return;
      const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const width = event.clientX - left;
      if (width >= MIN_WIDTH && width <= MAX_WIDTH) setSidebarWidth(width);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r-0" disableTransition={isResizing}>
          <SidebarHeader className="h-[88px] justify-center border-b border-sidebar-border/70 px-4">
            <div className="flex items-center gap-3 w-full">
              <button
                onClick={toggleSidebar}
                className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_6px_20px_rgba(151,190,30,0.22)] transition-transform active:scale-95"
                aria-label="Toggle navigation"
              >
                <span className="text-sm font-black tracking-tighter">MVP</span>
              </button>
              {!isCollapsed && (
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-black uppercase tracking-[0.18em] text-sidebar-foreground">MVP</p>
                  <p className="truncate text-xs text-sidebar-foreground/55">DLS League Manager</p>
                </div>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 px-3 py-5">
            {!isCollapsed && <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-sidebar-foreground/40">Workspace</p>}
            <SidebarMenu className="gap-1">
              {menuItems.map((item) => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className="h-11 rounded-xl px-3 text-sm font-semibold transition-colors data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:shadow-[0_8px_20px_rgba(151,190,30,0.17)]"
                    >
                      <item.icon className="size-[18px]" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border/70 p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
                  <Avatar className="size-9 shrink-0 border border-sidebar-border bg-sidebar-accent">
                    <AvatarFallback className="bg-primary/15 text-xs font-bold text-sidebar-foreground">{initials}</AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-sidebar-foreground">{displayName}</p>
                      <p className="truncate text-[11px] text-sidebar-foreground/50">{user?.email || "Authenticated workspace"}</p>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {user ? (
                  <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                    <LogOut className="mr-2 size-4" /> Sign out
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => startLogin()} className="cursor-pointer">
                    <LogIn className="mr-2 size-4" /> Sign in when ready
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute right-0 top-0 z-50 h-full w-1 cursor-col-resize transition-colors hover:bg-primary/30 ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => !isCollapsed && setIsResizing(true)}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border/70 bg-background/90 px-4 backdrop-blur-xl">
            <SidebarTrigger className="size-9 rounded-xl bg-card" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.17em] text-primary">MVP</p>
              <p className="text-sm font-semibold">{activeMenuItem?.label ?? "Workspace"}</p>
            </div>
          </div>
        )}
        <main className="min-h-screen flex-1">{children}</main>
      </SidebarInset>
    </>
  );
}

function AuthScreen() {
  return (
    <div className="mvp-grid grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-md rounded-[28px] border border-border/80 bg-card p-7 shadow-[0_20px_70px_rgba(22,25,38,0.08)] sm:p-9">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary text-sm font-black text-primary-foreground shadow-[0_8px_24px_rgba(151,190,30,0.24)]">MVP</div>
          <div><p className="text-sm font-black uppercase tracking-[0.18em]">MVP</p><p className="text-xs text-muted-foreground">DLS League Manager</p></div>
        </div>
        <p className="mt-10 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Private league workspace</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Manage your competition with confidence.</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">Sign in to create leagues, register teams, record results, and keep your own standings secure.</p>
        <div className="mt-7 grid gap-3">
          <button onClick={() => startLogin()} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-transform active:scale-[0.98]"><LogIn className="size-4" /> Log in</button>
          <button onClick={() => startLogin()} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-transparent px-4 text-sm font-bold transition-colors hover:bg-muted active:scale-[0.98]">Create an account <span aria-hidden="true">→</span></button>
        </div>
        <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">Authentication is handled securely by the configured Manus OAuth provider. New users can create an account from the same secure flow.</p>
      </div>
    </div>
  );
}
