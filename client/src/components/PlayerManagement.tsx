import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Check, Search, Trash2, UserPlus, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

function errorText(error: { message?: string }) { return error.message || "Something went wrong."; }

export default function PlayerManagement() {
  const leagues = trpc.league.overview.useQuery(undefined, { refetchOnWindowFocus: false });
  const [leagueId, setLeagueId] = useState("");
  const [form, setForm] = useState({ playerId: "" });
  const [foundPlayer, setFoundPlayer] = useState<{ playerId: number; playerName: string } | null>(null);
  useEffect(() => { if (!leagueId && leagues.data?.[0]) setLeagueId(String(leagues.data[0].id)); }, [leagueId, leagues.data]);
  const activeLeagueId = Number(leagueId) || 0;
  const playerId = Number(form.playerId) || 100000;
  const playerLookupInput = useMemo(() => ({ playerId }), [playerId]);
  const dashboard = trpc.league.dashboard.useQuery({ leagueId: activeLeagueId }, { enabled: activeLeagueId > 0, refetchOnWindowFocus: false });
  const players = trpc.playerAdmin.list.useQuery({ leagueId: activeLeagueId }, { enabled: activeLeagueId > 0, refetchOnWindowFocus: false });
  const lookup = trpc.playerAdmin.findPlayer.useQuery(playerLookupInput, { enabled: false, retry: false, refetchOnWindowFocus: false });
  const refresh = async () => { await Promise.all([players.refetch(), dashboard.refetch(), leagues.refetch()]); };
  const add = trpc.playerAdmin.add.useMutation({ onSuccess: async () => { toast.success("Player registration added for review."); setForm({ playerId: "" }); setFoundPlayer(null); await refresh(); }, onError: (error) => toast.error(errorText(error)) });
  const review = trpc.playerAdmin.review.useMutation({ onSuccess: async () => { toast.success("Player registration updated."); await refresh(); }, onError: (error) => toast.error(errorText(error)) });
  const remove = trpc.playerAdmin.remove.useMutation({ onSuccess: async () => { toast.success("Player removed from this league."); await refresh(); }, onError: (error) => toast.error(errorText(error)) });
  const teamOptions = dashboard.data?.teams ?? [];
  const selectedLeague = leagues.data?.find((league) => league.id === activeLeagueId);

  const findPlayer = async (event: React.FormEvent) => {
    event.preventDefault();
    setFoundPlayer(null);
    if (!Number.isInteger(Number(form.playerId)) || Number(form.playerId) < 100000 || Number(form.playerId) > 999999) {
      toast.error("Enter a valid six-digit Player ID.");
      return;
    }
    const result = await lookup.refetch();
    if (result.data) setFoundPlayer(result.data);
    else if (result.error) toast.error(result.error.message);
  };

  return <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-8 sm:py-10">
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Player management</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Build the player register.</h1><p className="mt-2 text-sm text-muted-foreground">Find players by their exact Player ID. Private account details are never shown.</p></div><div className="w-full sm:w-72"><Label>Active league</Label><Select value={leagueId} onValueChange={setLeagueId}><SelectTrigger className="mt-2 h-11 rounded-xl"><SelectValue placeholder="Choose a league" /></SelectTrigger><SelectContent>{leagues.data?.map((league) => <SelectItem key={league.id} value={String(league.id)}>{league.name} · {league.seasonName}</SelectItem>)}</SelectContent></Select></div></div>
    {!selectedLeague ? <Card className="mt-8 rounded-[22px] shadow-none"><CardContent className="grid place-items-center gap-3 p-12 text-center"><Users className="size-9 text-primary" /><h2 className="text-xl font-bold">Create a league first</h2><p className="text-sm text-muted-foreground">Player registrations are always scoped to one of your leagues.</p></CardContent></Card> : <div className="mt-8 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="rounded-[22px] border-border/80 shadow-none"><CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="size-5 text-primary" /> Add a player</CardTitle><CardDescription>Ask the player for their six-digit Player ID. Find and confirm the player before adding them to {selectedLeague.name}.</CardDescription></CardHeader><CardContent><form onSubmit={findPlayer} className="grid gap-4"><div><Label>Player ID</Label><Input required type="number" min="100000" max="999999" value={form.playerId} onChange={(event) => { setForm({ playerId: event.target.value }); setFoundPlayer(null); }} placeholder="e.g. 583214" /></div><Button type="submit" variant="outline" disabled={lookup.isFetching} className="h-11 rounded-xl font-bold"><Search className="size-4" /> {lookup.isFetching ? "Finding…" : "Find player"}</Button></form>{foundPlayer && <div className="mt-5 grid gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Player found</p><p className="mt-2 font-bold">{foundPlayer.playerName}</p><p className="text-sm text-muted-foreground">Player ID: {foundPlayer.playerId}</p></div><p className="text-sm leading-6">Add {foundPlayer.playerName} (Player ID: {foundPlayer.playerId}) to {selectedLeague.name}?</p><Button disabled={add.isPending} onClick={() => add.mutate({ leagueId: activeLeagueId, playerId: foundPlayer.playerId })} className="h-11 rounded-xl font-bold">{add.isPending ? "Adding…" : "Add to league"}</Button></div>}</CardContent></Card>
      <Card className="rounded-[22px] border-border/80 shadow-none"><CardHeader className="border-b border-border/70"><CardTitle>Registered players</CardTitle><CardDescription>{players.data?.length ?? 0} player registration{players.data?.length === 1 ? "" : "s"} in {selectedLeague.name}.</CardDescription></CardHeader><CardContent className="grid gap-3 p-5">{players.data?.length ? players.data.map(({ membership, user, team }) => <div key={membership.id} className="grid gap-4 rounded-2xl border border-border/70 p-4 lg:grid-cols-[minmax(180px,1fr)_170px_auto]"><div className="min-w-0"><div className="flex items-center gap-2"><p className="font-bold">{membership.playerName}</p><Badge variant={membership.registrationStatus === "approved" ? "default" : membership.registrationStatus === "rejected" ? "destructive" : "secondary"} className="rounded-full capitalize">{membership.registrationStatus}</Badge></div><p className="mt-1 text-sm text-muted-foreground">Player ID: {user.playerId} · @{membership.username}</p></div><Select value={team?.id ? String(team.id) : "unassigned"} onValueChange={(value) => review.mutate({ membershipId: membership.id, registrationStatus: "approved", teamId: value === "unassigned" ? null : Number(value) })}><SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Assign team" /></SelectTrigger><SelectContent><SelectItem value="unassigned">No team</SelectItem>{teamOptions.map((option) => <SelectItem key={option.id} value={String(option.id)}>{option.name}</SelectItem>)}</SelectContent></Select><div className="flex items-center justify-end gap-2">{membership.registrationStatus !== "approved" && <Button size="sm" className="rounded-lg" onClick={() => review.mutate({ membershipId: membership.id, registrationStatus: "approved", teamId: team?.id ?? null })}><Check className="size-4" /> Approve</Button>}{membership.registrationStatus !== "rejected" && <Button size="sm" variant="outline" className="rounded-lg" onClick={() => review.mutate({ membershipId: membership.id, registrationStatus: "rejected", teamId: null })}><X className="size-4" /> Reject</Button>}<Button size="icon-sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => remove.mutate({ membershipId: membership.id })} aria-label={`Remove ${membership.playerName}`}><Trash2 className="size-4" /></Button></div></div>) : <div className="rounded-xl bg-muted/50 p-8 text-center text-sm text-muted-foreground">No players registered yet. Find a player by ID to start the register.</div>}</CardContent></Card>
    </div>}
  </div>;
}
