import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Bell, Check, CheckCheck, Clock3, ShieldCheck, UserPlus } from "lucide-react";
import { useLocation } from "wouter";

function relativeTime(value: Date | string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function NotificationIcon({ type }: { type: "join_request" | "approval" | "dispute" }) {
  if (type === "join_request") return <UserPlus className="size-4" />;
  if (type === "dispute") return <AlertTriangle className="size-4" />;
  return <ShieldCheck className="size-4" />;
}

export default function NotificationCenter() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const query = trpc.notifications.list.useQuery(undefined, { refetchInterval: 30000, refetchOnWindowFocus: true });
  const markRead = trpc.notifications.markRead.useMutation({ onSuccess: () => utils.notifications.list.invalidate() });
  const markAllRead = trpc.notifications.markAllRead.useMutation({ onSuccess: () => utils.notifications.list.invalidate() });
  const unreadCount = query.data?.unreadCount ?? 0;
  const items = query.data?.items ?? [];

  const openNotification = (notification: (typeof items)[number]) => {
    if (!notification.readAt) markRead.mutate({ notificationId: notification.id });
    if (notification.href) setLocation(notification.href);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative size-10 rounded-xl bg-background" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}>
          <Bell className="size-4" />
          {unreadCount > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-black leading-5 text-destructive-foreground">{unreadCount > 9 ? "9+" : unreadCount}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(380px,calc(100vw-2rem))] rounded-2xl p-2">
        <div className="flex items-center justify-between px-3 py-2">
          <div><p className="font-bold">Notifications</p><p className="text-xs text-muted-foreground">{unreadCount ? `${unreadCount} unread` : "You’re all caught up"}</p></div>
          {unreadCount > 0 && <button type="button" onClick={() => markAllRead.mutate()} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><CheckCheck className="size-3.5" /> Mark all read</button>}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-[min(420px,60vh)] overflow-y-auto">
          {query.isLoading ? <p className="px-3 py-8 text-center text-sm text-muted-foreground">Loading notifications…</p> : items.length === 0 ? <div className="grid place-items-center gap-2 px-3 py-8 text-center"><Check className="size-7 text-primary" /><p className="text-sm font-semibold">No notifications yet</p><p className="text-xs text-muted-foreground">Join requests, approvals, and disputed results will appear here.</p></div> : items.map((notification) => <DropdownMenuItem key={notification.id} onSelect={() => openNotification(notification)} className={`items-start gap-3 rounded-xl p-3 ${notification.readAt ? "opacity-65" : "bg-primary/5"}`}><span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${notification.type === "dispute" ? "bg-destructive/10 text-destructive" : notification.type === "join_request" ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"}`}><NotificationIcon type={notification.type} /></span><span className="min-w-0 flex-1"><span className="block font-semibold">{notification.title}</span><span className="mt-1 block whitespace-normal text-xs leading-5 text-muted-foreground">{notification.message}</span><span className="mt-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><Clock3 className="size-3" /> {relativeTime(notification.createdAt)}</span></span>{!notification.readAt && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />}</DropdownMenuItem>)}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
