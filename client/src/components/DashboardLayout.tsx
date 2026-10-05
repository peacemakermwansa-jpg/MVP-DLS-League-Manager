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
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import {
  CalendarDays,
  ClipboardCheck,
  Flag,
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
import NotificationCenter from "./NotificationCenter";

const menuItems = [
  { icon: LayoutDashboard, label: "Overview", path: "/" },
  { icon: Trophy, label: "Leagues", path: "/leagues" },
  { icon: Users, label: "Teams", path: "/teams" },
  { icon: CalendarDays, label: "Fixtures", path: "/fixtures" },
  { icon: ClipboardCheck, label: "Results", path: "/results" },
  { icon: ShieldCheck, label: "League table", path: "/table" },
  { icon: UserRound, label: "My player centre", path: "/player" },
  { icon: Flag, label: "My matches", path: "/matches" },
  { icon: Users, label: "Player register", path: "/players" },
  { icon: ClipboardCheck, label: "Match management", path: "/match-management" },
];

const participantMenuItems = [
  { icon: LayoutDashboard, label: "My player centre", path: "/player" },
  { icon: Flag, label: "My matches", path: "/matches" },
];

const adminOnlyPaths = new Set(["/", "/leagues", "/teams", "/fixtures", "/results", "/table", "/players", "/match-management"]);

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
  if (!user.accountTypeSelected) return <AccountTypeSelection />;

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
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const role = user?.role ?? "participant";
  const visibleMenuItems = role === "admin" ? menuItems : participantMenuItems;
  const activeMenuItem = visibleMenuItems.find((item) => item.path === location);
  const displayName = user?.name || "League administrator";
  const initials = displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    if (role === "participant" && adminOnlyPaths.has(location)) setLocation("/player");
  }, [location, role, setLocation]);

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
              {visibleMenuItems.map((item) => {
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
        <div className="fixed right-5 top-4 z-50 hidden md:block">
          <NotificationCenter />
        </div>
        <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border/70 bg-background/90 px-4 backdrop-blur-xl md:hidden">
          <SidebarTrigger />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-primary">MVP</p>
            <p className="text-sm font-semibold">{activeMenuItem?.label ?? "Workspace"}</p>
          </div>
          <div className="ml-auto"><NotificationCenter /></div>
        </div>
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

function AccountTypeSelection() {
  const utils = trpc.useUtils();
  const chooseAccountType = trpc.auth.chooseAccountType.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
    },
  });

  return (
    <div className="mvp-grid grid min-h-screen place-items-center bg-background p-6">
      <Card className="w-full max-w-3xl rounded-[28px] border-border/80 bg-card shadow-[0_20px_70px_rgba(22,25,38,0.08)]">
        <CardContent className="p-7 sm:p-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Set up your MVP account</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">How will you use MVP?</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Choose the account type that best matches your role. You can participate in leagues from either account type, but only admins can create and manage leagues they own.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <button type="button" disabled={chooseAccountType.isPending} onClick={() => chooseAccountType.mutate({ accountType: "admin" })} className="rounded-2xl border border-primary/30 bg-primary/5 p-5 text-left transition-colors hover:border-primary hover:bg-primary/10 disabled:cursor-wait disabled:opacity-60">
              <p className="text-lg font-bold">Create &amp; manage leagues</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Create leagues, register teams, manage participants, generate fixtures, and resolve results for leagues you own.</p>
              <span className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Choose Admin</span>
            </button>
            <button type="button" disabled={chooseAccountType.isPending} onClick={() => chooseAccountType.mutate({ accountType: "participant" })} className="rounded-2xl border border-border bg-background p-5 text-left transition-colors hover:border-primary/50 hover:bg-muted disabled:cursor-wait disabled:opacity-60">
              <p className="text-lg font-bold">Join leagues</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Use a League ID to register, view your teams and fixtures, and submit or confirm results where permitted.</p>
              <span className="mt-5 inline-flex rounded-xl border border-border px-4 py-2 text-sm font-bold">Choose Participant</span>
            </button>
          </div>
          {chooseAccountType.error && <p className="mt-4 text-sm font-semibold text-destructive">{chooseAccountType.error.message}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
