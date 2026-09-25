import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RouterOutputs, trpc } from "@/lib/trpc";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  Clock3,
  Crown,
  ListChecks,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

 type LeagueSummary = RouterOutputs["league"]["overview"][number];
type LeagueDashboard = RouterOutputs["league"]["dashboard"];
type Team = LeagueDashboard["teams"][number];
type Fixture = LeagueDashboard["fixtures"][number];

type LeagueForm = { name: string; seasonName: string; numberOfTeams: string };
type TeamForm = { name: string; managerName: string; logoUrl: string };

const EMPTY_LEAGUE_FORM: LeagueForm = { name: "", seasonName: "", numberOfTeams: "8" };
const EMPTY_TEAM_FORM: TeamForm = { name: "", managerName: "", logoUrl: "" };

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function initials(value: string) {
  return value
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(value: Date | null) {
  if (!value) return "Not played";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
        {hint && <span className="normal-case tracking-normal text-muted-foreground/60">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h2>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ icon: Icon, title, description, action }: { icon: typeof Trophy; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="grid min-h-[260px] place-items-center rounded-[22px] border border-dashed border-border bg-card/55 p-8 text-center">
      <div className="max-w-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/15 text-primary"><Icon className="size-6" /></div>
        <h3 className="mt-4 text-lg font-bold">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}

function FixtureRow({ fixture, onRecordResult }: { fixture: Fixture; onRecordResult?: () => void }) {
  const completed = fixture.status === "completed";
  return (
    <div className="group flex flex-col gap-4 rounded-2xl border border-border/80 bg-background/70 p-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.13em] text-muted-foreground">
        <span className="rounded-lg bg-muted px-2 py-1">R{fixture.round}</span>
        <span>{completed ? formatDate(fixture.playedAt) : "Upcoming"}</span>
      </div>
      <div className="grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-3 sm:max-w-md">
        <div className="flex items-center justify-end gap-2 text-right">
          <span className="truncate text-sm font-bold">{fixture.homeTeam.name}</span>
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-[10px] font-bold text-primary">{initials(fixture.homeTeam.name)}</span>
        </div>
        <div className="number-display min-w-[58px] text-center text-xl font-bold text-foreground">
          {completed ? `${fixture.homeScore} — ${fixture.awayScore}` : "vs"}
        </div>
        <div className="flex items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-[10px] font-bold text-secondary-foreground">{initials(fixture.awayTeam.name)}</span>
          <span className="truncate text-sm font-bold">{fixture.awayTeam.name}</span>
        </div>
      </div>
      <div className="flex justify-end sm:min-w-[104px]">
        {completed ? (
          <Badge variant="secondary" className="gap-1 rounded-full bg-primary/10 text-primary"><CircleCheck className="size-3" /> Final</Badge>
        ) : onRecordResult ? (
          <Button variant="outline" size="sm" onClick={onRecordResult}>Record result <ArrowRight className="size-3.5" /></Button>
        ) : (
          <Badge variant="outline" className="gap-1 rounded-full"><Clock3 className="size-3" /> Pending</Badge>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, detail, icon: Icon, accent = false }: { label: string; value: string | number; detail: string; icon: typeof Trophy; accent?: boolean }) {
  return (
    <Card className={`overflow-hidden rounded-[20px] border-border/80 shadow-none ${accent ? "bg-primary text-primary-foreground" : "bg-card"}`}>
      <CardContent className="relative p-5">
        <div className={`grid size-9 place-items-center rounded-xl ${accent ? "bg-primary-foreground/15" : "bg-primary/12 text-primary"}`}><Icon className="size-[18px]" /></div>
        <p className={`mt-5 text-[11px] font-bold uppercase tracking-[0.14em] ${accent ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{label}</p>
        <p className="number-display mt-1 text-3xl font-bold tracking-tight">{value}</p>
        <p className={`mt-1 text-xs ${accent ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{detail}</p>
        <div className={`absolute -right-8 -top-8 size-28 rounded-full border-[18px] ${accent ? "border-primary-foreground/10" : "border-primary/8"}`} />
      </CardContent>
    </Card>
  );
}

export default function LeagueWorkspace() {
  const [location, setLocation] = useLocation();
  const view = location === "/" ? "overview" : location.slice(1);
  const [activeLeagueId, setActiveLeagueId] = useState<number | null>(null);
  const [leagueForm, setLeagueForm] = useState<LeagueForm>(EMPTY_LEAGUE_FORM);
  const [teamForm, setTeamForm] = useState<TeamForm>(EMPTY_TEAM_FORM);
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [resultForm, setResultForm] = useState({ fixtureId: "", homeScore: "", awayScore: "" });

  const overviewQuery = trpc.league.overview.useQuery(undefined, { refetchOnWindowFocus: false });
  const leagueSummaries = overviewQuery.data ?? [];
  const activeLeague = leagueSummaries.find((league) => league.id === activeLeagueId) ?? leagueSummaries[0];
  const activeId = activeLeague?.id ?? null;
  const dashboardQuery = trpc.league.dashboard.useQuery(
    { leagueId: activeId ?? 0 },
    { enabled: activeId !== null, refetchOnWindowFocus: false }
  );
  const dashboard = dashboardQuery.data;
  const utils = trpc.useUtils();

  useEffect(() => {
    if (activeLeagueId === null && leagueSummaries[0]) setActiveLeagueId(leagueSummaries[0].id);
    if (activeLeagueId !== null && !leagueSummaries.some((league) => league.id === activeLeagueId)) {
      setActiveLeagueId(leagueSummaries[0]?.id ?? null);
    }
  }, [activeLeagueId, leagueSummaries]);

  useEffect(() => {
    if (!resultForm.fixtureId && dashboard?.fixtures.find((fixture) => fixture.status === "pending")) {
      const next = dashboard.fixtures.find((fixture) => fixture.status === "pending");
      if (next) setResultForm((current) => ({ ...current, fixtureId: String(next.id) }));
    }
  }, [dashboard, resultForm.fixtureId]);

  const refreshLeague = async (nextLeagueId?: number) => {
    await utils.league.overview.invalidate();
    await utils.league.dashboard.invalidate();
    if (nextLeagueId) setActiveLeagueId(nextLeagueId);
  };

  const createLeagueMutation = trpc.league.create.useMutation({
    onSuccess: async ({ id }) => {
      toast.success("League created. Add your teams to get started.");
      setLeagueForm(EMPTY_LEAGUE_FORM);
      await refreshLeague(id);
      setLocation("/leagues");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const addTeamMutation = trpc.league.addTeam.useMutation({
    onSuccess: async () => {
      toast.success("Team registered.");
      setTeamForm(EMPTY_TEAM_FORM);
      await refreshLeague();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const updateTeamMutation = trpc.league.updateTeam.useMutation({
    onSuccess: async () => {
      toast.success("Team details updated.");
      setEditingTeamId(null);
      setTeamForm(EMPTY_TEAM_FORM);
      await refreshLeague();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const removeTeamMutation = trpc.league.removeTeam.useMutation({
    onSuccess: async () => {
      toast.success("Team removed.");
      await refreshLeague();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const fixturesMutation = trpc.league.generateFixtures.useMutation({
    onSuccess: async ({ fixtureCount }) => {
      toast.success(`${fixtureCount} home-and-away fixtures generated.`);
      await refreshLeague();
      setLocation("/fixtures");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const resultMutation = trpc.league.recordResult.useMutation({
    onSuccess: async () => {
      toast.success("Result saved. League table updated.");
      setResultForm({ fixtureId: "", homeScore: "", awayScore: "" });
      await refreshLeague();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const fixtures = dashboard?.fixtures ?? [];
  const teams = dashboard?.teams ?? [];
  const standings = dashboard?.standings ?? [];
  const upcomingFixtures = fixtures.filter((fixture) => fixture.status === "pending");
  const completedFixtures = fixtures.filter((fixture) => fixture.status === "completed");
  const selectedFixture = fixtures.find((fixture) => fixture.id === Number(resultForm.fixtureId));
  const stats = useMemo(() => ({
    fixtureTotal: fixtures.length,
    completed: completedFixtures.length,
    leadingTeam: standings[0]?.teamName ?? "—",
  }), [completedFixtures.length, fixtures.length, standings]);

  const handleCreateLeague = (event: FormEvent) => {
    event.preventDefault();
    createLeagueMutation.mutate({ ...leagueForm, numberOfTeams: Number(leagueForm.numberOfTeams) });
  };

  const handleSaveTeam = (event: FormEvent) => {
    event.preventDefault();
    if (!activeId) return toast.error("Create or select a league first.");
    const input = { name: teamForm.name, managerName: teamForm.managerName, logoUrl: teamForm.logoUrl || undefined };
    if (editingTeamId) updateTeamMutation.mutate({ teamId: editingTeamId, ...input });
    else addTeamMutation.mutate({ leagueId: activeId, ...input });
  };

  const startEditing = (team: Team) => {
    setEditingTeamId(team.id);
    setTeamForm({ name: team.name, managerName: team.managerName, logoUrl: team.logoUrl ?? "" });
  };

  const handleRecordResult = (event: FormEvent) => {
    event.preventDefault();
    if (!resultForm.fixtureId) return toast.error("Select a fixture first.");
    if (resultForm.homeScore === "" || resultForm.awayScore === "") return toast.error("Enter both scores.");
    resultMutation.mutate({ fixtureId: Number(resultForm.fixtureId), homeScore: Number(resultForm.homeScore), awayScore: Number(resultForm.awayScore) });
  };

  const renderLeagueForm = () => (
    <Card className="rounded-[22px] border-border/80 bg-card shadow-none">
      <CardHeader className="border-b border-border/70 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div><CardTitle className="text-lg">Create a league</CardTitle><CardDescription className="mt-2">Set the season up once. You can add teams and generate the schedule next.</CardDescription></div>
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary"><Plus className="size-5" /></div>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        <form className="grid gap-4" onSubmit={handleCreateLeague}>
          <Field label="League name"><Input required value={leagueForm.name} onChange={(event) => setLeagueForm({ ...leagueForm, name: event.target.value })} placeholder="e.g. MVP Premier League" /></Field>
          <Field label="Season name"><Input required value={leagueForm.seasonName} onChange={(event) => setLeagueForm({ ...leagueForm, seasonName: event.target.value })} placeholder="e.g. 2026 Season 1" /></Field>
          <Field label="Number of teams" hint="2–32"><Input required min={2} max={32} type="number" value={leagueForm.numberOfTeams} onChange={(event) => setLeagueForm({ ...leagueForm, numberOfTeams: event.target.value })} /></Field>
          <Button type="submit" className="mt-2 h-11 rounded-xl font-bold" disabled={createLeagueMutation.isPending}>{createLeagueMutation.isPending ? "Creating…" : "Create league"}<ArrowRight className="size-4" /></Button>
        </form>
      </CardContent>
    </Card>
  );

  const renderLeagueSelector = () => (
    <Card className="rounded-[22px] border-border/80 bg-card shadow-none">
      <CardHeader className="pb-4"><CardTitle className="flex items-center gap-2 text-base"><Trophy className="size-4 text-primary" /> Your leagues</CardTitle><CardDescription>Choose a league to manage its teams and matchdays.</CardDescription></CardHeader>
      <CardContent className="grid gap-2 px-3 pb-3">
        {leagueSummaries.length === 0 ? <div className="rounded-xl bg-muted/70 p-4 text-sm text-muted-foreground">No leagues yet. Create your first competition to unlock the workspace.</div> : leagueSummaries.map((league: LeagueSummary) => (
          <button key={league.id} onClick={() => { setActiveLeagueId(league.id); setLocation("/"); }} className={`flex items-center gap-3 rounded-xl p-3 text-left transition-colors ${activeId === league.id ? "bg-primary/12" : "hover:bg-muted"}`}>
            <div className={`grid size-9 shrink-0 place-items-center rounded-xl text-xs font-bold ${activeId === league.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{initials(league.name)}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{league.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{league.seasonName} · {league.teamCount}/{league.numberOfTeams} teams</p></div>
            <ChevronRight className={`size-4 ${activeId === league.id ? "text-primary" : "text-muted-foreground"}`} />
          </button>
        ))}
        <Button variant="outline" className="mt-2 h-10 rounded-xl" onClick={() => setLocation("/leagues")}>Manage leagues <ArrowUpRight className="size-4" /></Button>
      </CardContent>
    </Card>
  );

  const renderOverview = () => (
    <>
      <SectionHeading eyebrow="Overview" title={activeLeague ? `${activeLeague.name} is in your hands.` : "Your league command center."} description={activeLeague ? `${activeLeague.seasonName} · Keep registration, fixtures, results, and the table moving from one place.` : "Create your first DLS league to turn a blank season into a managed competition."} action={<Button onClick={() => setLocation("/leagues")} className="h-11 rounded-xl font-bold"><Plus className="size-4" /> New league</Button>} />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Teams registered" value={`${teams.length}/${activeLeague?.numberOfTeams ?? "—"}`} detail={activeLeague ? "League registration" : "Select a league"} icon={Users} />
        <StatCard label="Fixtures" value={stats.fixtureTotal} detail={`${upcomingFixtures.length} upcoming`} icon={CalendarDays} />
        <StatCard label="Results logged" value={stats.completed} detail="Feeds the table automatically" icon={ListChecks} accent />
        <StatCard label="Table leader" value={stats.leadingTeam} detail={standings[0] ? `${standings[0].points} points` : "No results yet"} icon={Crown} />
      </div>
      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <Card className="rounded-[24px] border-border/80 bg-card shadow-none">
          <CardHeader className="flex-row items-center justify-between border-b border-border/70 pb-5"><div><CardTitle className="text-lg">Next on the pitch</CardTitle><CardDescription className="mt-1">The nearest scheduled matches for your active league.</CardDescription></div><Button variant="ghost" size="sm" onClick={() => setLocation("/fixtures")}>View all <ArrowRight className="size-4" /></Button></CardHeader>
          <CardContent className="grid gap-3 p-5">
            {!activeLeague ? <EmptyState icon={Trophy} title="No active league yet" description="Create a league, then register teams to get a matchday schedule." action={<Button onClick={() => setLocation("/leagues")} className="rounded-xl">Create first league</Button>} /> : upcomingFixtures.length ? upcomingFixtures.slice(0, 3).map((fixture) => <FixtureRow key={fixture.id} fixture={fixture} onRecordResult={() => { setResultForm({ fixtureId: String(fixture.id), homeScore: "", awayScore: "" }); setLocation("/results"); }} />) : <EmptyState icon={CalendarDays} title="Fixtures are ready when you are" description={teams.length < 2 ? "Add at least two teams to unlock the home-and-away schedule." : "Generate the full round-robin schedule from the Fixtures section."} action={teams.length >= 2 ? <Button onClick={() => fixturesMutation.mutate({ leagueId: activeId! })} disabled={fixturesMutation.isPending} className="rounded-xl">{fixturesMutation.isPending ? "Generating…" : "Generate fixtures"}</Button> : undefined} />}
          </CardContent>
        </Card>
        <div className="grid gap-6">{renderLeagueSelector()}<Card className="rounded-[22px] border-none bg-[#292743] text-white shadow-none"><CardContent className="relative overflow-hidden p-6"><div className="relative z-10"><p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-primary"><Sparkles className="size-3.5" /> MVP playbook</p><h3 className="mt-4 max-w-[230px] text-xl font-bold leading-tight">Build the season, then let the table do the math.</h3><p className="mt-3 max-w-[260px] text-sm leading-6 text-white/60">Fixtures are generated twice: home and away. Every saved result updates points, goal difference, and ranking.</p></div><div className="absolute -bottom-10 -right-8 size-36 rounded-full border-[22px] border-primary/20" /><div className="absolute -right-3 top-8 size-20 rounded-full bg-primary/10" /></CardContent></Card></div>
      </div>
      {activeLeague && <Card className="mt-6 rounded-[24px] border-border/80 bg-card shadow-none"><CardHeader className="flex-row items-center justify-between border-b border-border/70 pb-5"><div><CardTitle className="text-lg">Standings snapshot</CardTitle><CardDescription className="mt-1">Sorted by points, goal difference, then goals scored.</CardDescription></div><Button variant="outline" size="sm" onClick={() => setLocation("/table")}>Open full table <ArrowRight className="size-3.5" /></Button></CardHeader><CardContent className="overflow-x-auto p-0"><StandingsTable rows={standings.slice(0, 5)} compact /></CardContent></Card>}
    </>
  );

  const renderLeagues = () => (
    <>
      <SectionHeading eyebrow="League management" title="Shape the competition." description="Create seasons, keep the league register clear, and switch between competitions without losing context." action={<Button onClick={() => setLocation("/")} variant="outline" className="h-10 rounded-xl">Back to overview</Button>} />
      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(320px,0.72fr)_minmax(0,1.28fr)]"><div>{renderLeagueForm()}</div><Card className="rounded-[22px] border-border/80 bg-card shadow-none"><CardHeader className="border-b border-border/70 pb-5"><CardTitle className="text-lg">Registered leagues</CardTitle><CardDescription>{leagueSummaries.length ? `${leagueSummaries.length} competition${leagueSummaries.length === 1 ? "" : "s"} in your workspace.` : "Your league list will appear here."}</CardDescription></CardHeader><CardContent className="grid gap-3 p-5">{leagueSummaries.length ? leagueSummaries.map((league) => <button key={league.id} onClick={() => { setActiveLeagueId(league.id); setLocation("/teams"); }} className={`flex flex-col gap-4 rounded-2xl border p-4 text-left transition-all sm:flex-row sm:items-center sm:justify-between ${activeId === league.id ? "border-primary/50 bg-primary/5" : "border-border/80 hover:border-primary/30"}`}><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-secondary text-xs font-bold">{initials(league.name)}</div><div><p className="font-bold">{league.name}</p><p className="mt-1 text-sm text-muted-foreground">{league.seasonName} · created {formatDate(league.createdAt)}</p></div></div><div className="flex items-center gap-4 text-xs text-muted-foreground"><span><strong className="text-foreground">{league.teamCount}</strong> teams</span><span><strong className="text-foreground">{league.completedFixtureCount}</strong> results</span><ChevronRight className="size-4" /></div></button>) : <EmptyState icon={Trophy} title="Start with one competition" description="A league holds its season name, team limit, fixtures, results, and table in one place." />}</CardContent></Card></div>
    </>
  );

  const renderTeams = () => (
    <>
      <SectionHeading eyebrow="Team management" title="Register the players." description={activeLeague ? `${activeLeague.name} · ${teams.length} of ${activeLeague.numberOfTeams} team slots filled.` : "Select a league to register teams."} action={activeLeague ? <Badge variant="outline" className="h-8 rounded-full px-3"><Users className="mr-1.5 size-3.5" /> {teams.length}/{activeLeague.numberOfTeams} registered</Badge> : undefined} />
      {!activeLeague ? <div className="mt-8"><EmptyState icon={Trophy} title="Choose a league first" description="Create a league before registering teams." action={<Button onClick={() => setLocation("/leagues")} className="rounded-xl">Go to leagues</Button>} /></div> : <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)]"><Card className="h-fit rounded-[22px] border-border/80 bg-card shadow-none"><CardHeader className="border-b border-border/70 pb-5"><CardTitle className="text-lg">{editingTeamId ? "Edit team" : "Add a team"}</CardTitle><CardDescription>{editingTeamId ? "Update the team record below." : "A manager name is required for every registered team."}</CardDescription></CardHeader><CardContent className="p-5"><form className="grid gap-4" onSubmit={handleSaveTeam}><Field label="Team name"><Input required value={teamForm.name} onChange={(event) => setTeamForm({ ...teamForm, name: event.target.value })} placeholder="e.g. Green Warriors" /></Field><Field label="Manager / player"><Input required value={teamForm.managerName} onChange={(event) => setTeamForm({ ...teamForm, managerName: event.target.value })} placeholder="e.g. Alex Mwansa" /></Field><Field label="Team logo" hint="optional"><Input type="url" value={teamForm.logoUrl} onChange={(event) => setTeamForm({ ...teamForm, logoUrl: event.target.value })} placeholder="https://…" /></Field><div className="flex gap-2 pt-2"><Button type="submit" className="h-11 flex-1 rounded-xl font-bold" disabled={addTeamMutation.isPending || updateTeamMutation.isPending}>{editingTeamId ? "Save changes" : "Register team"}</Button>{editingTeamId && <Button type="button" variant="outline" size="icon" className="size-11 rounded-xl" onClick={() => { setEditingTeamId(null); setTeamForm(EMPTY_TEAM_FORM); }} aria-label="Cancel edit"><X className="size-4" /></Button>}</div></form></CardContent></Card><div className="grid content-start gap-3">{teams.length ? teams.map((team) => <div key={team.id} className="flex items-center gap-4 rounded-2xl border border-border/80 bg-card p-4 transition-colors hover:border-primary/35"><div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary/12 text-xs font-bold text-primary">{team.logoUrl ? <img src={team.logoUrl} alt="" className="size-full object-cover" /> : initials(team.name)}</div><div className="min-w-0 flex-1"><p className="truncate font-bold">{team.name}</p><p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><Users className="size-3.5" /> {team.managerName}</p></div><div className="flex shrink-0 gap-1"><Button variant="ghost" size="icon-sm" onClick={() => startEditing(team)} aria-label={`Edit ${team.name}`}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon-sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => { if (window.confirm(`Remove ${team.name} from this league?`)) removeTeamMutation.mutate({ teamId: team.id }); }} aria-label={`Remove ${team.name}`}><Trash2 className="size-4" /></Button></div></div>) : <EmptyState icon={Users} title="No teams registered" description="Add the first team to begin building this season's register." />}</div></div>}
    </>
  );

  const renderFixtures = () => (
    <>
      <SectionHeading eyebrow="Fixture management" title="Own every matchday." description={activeLeague ? `${activeLeague.name} · Home and away schedule for ${teams.length} registered teams.` : "Select a league to generate fixtures."} action={activeLeague && fixtures.length === 0 ? <Button onClick={() => fixturesMutation.mutate({ leagueId: activeId! })} disabled={teams.length < 2 || fixturesMutation.isPending} className="h-10 rounded-xl font-bold"><RefreshCw className="size-4" /> {fixturesMutation.isPending ? "Generating…" : "Generate schedule"}</Button> : undefined} />
      <div className="mt-8">{!activeLeague ? <EmptyState icon={Trophy} title="Choose a league first" description="Fixture generation happens inside a league with registered teams." action={<Button onClick={() => setLocation("/leagues")} className="rounded-xl">Go to leagues</Button>} /> : fixtures.length === 0 ? <EmptyState icon={CalendarDays} title="No schedule yet" description={teams.length < 2 ? "Register at least two teams to generate a round-robin home-and-away schedule." : `Generate ${(teams.length * (teams.length - 1))} fixtures for this ${teams.length}-team league.`} action={teams.length >= 2 ? <Button onClick={() => fixturesMutation.mutate({ leagueId: activeId! })} disabled={fixturesMutation.isPending} className="rounded-xl">{fixturesMutation.isPending ? "Generating…" : "Generate fixtures"}<ArrowRight className="size-4" /></Button> : <Button onClick={() => setLocation("/teams")} variant="outline" className="rounded-xl">Register teams</Button>} /> : <div className="grid gap-8"><Card className="rounded-[22px] border-border/80 bg-card shadow-none"><CardHeader className="border-b border-border/70 pb-5"><div className="flex items-center justify-between gap-4"><div><CardTitle className="text-lg">Upcoming fixtures</CardTitle><CardDescription className="mt-1">{upcomingFixtures.length} matches waiting for a result.</CardDescription></div><Badge className="rounded-full bg-primary/12 text-primary hover:bg-primary/12">{upcomingFixtures.length}</Badge></div></CardHeader><CardContent className="grid gap-3 p-5">{upcomingFixtures.length ? upcomingFixtures.map((fixture) => <FixtureRow key={fixture.id} fixture={fixture} onRecordResult={() => { setResultForm({ fixtureId: String(fixture.id), homeScore: "", awayScore: "" }); setLocation("/results"); }} />) : <div className="rounded-xl bg-primary/8 p-4 text-sm text-primary"><CircleCheck className="mr-2 inline size-4" /> Every scheduled fixture has a result.</div>}</CardContent></Card><Card className="rounded-[22px] border-border/80 bg-card shadow-none"><CardHeader className="border-b border-border/70 pb-5"><div className="flex items-center justify-between gap-4"><div><CardTitle className="text-lg">Completed fixtures</CardTitle><CardDescription className="mt-1">Saved results from this league schedule.</CardDescription></div><Badge variant="secondary" className="rounded-full">{completedFixtures.length}</Badge></div></CardHeader><CardContent className="grid gap-3 p-5">{completedFixtures.length ? completedFixtures.map((fixture) => <FixtureRow key={fixture.id} fixture={fixture} />) : <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">No completed fixtures yet.</p>}</CardContent></Card></div>}</div>
    </>
  );

  const renderResults = () => (
    <>
      <SectionHeading
        eyebrow="Result management"
        title="Log the final whistle."
        description="Choose an upcoming fixture, enter both scores, and MVP will recalculate the league table instantly."
      />
      {!activeLeague ? (
        <div className="mt-8">
          <EmptyState
            icon={Trophy}
            title="Choose a league first"
            description="Results are always scoped to the active league."
            action={<Button onClick={() => setLocation("/leagues")} className="rounded-xl">Go to leagues</Button>}
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(320px,0.75fr)_minmax(0,1.25fr)]">
          <Card className="h-fit rounded-[22px] border-border/80 bg-card shadow-none">
            <CardHeader className="border-b border-border/70 pb-5">
              <CardTitle className="text-lg">Enter result</CardTitle>
              <CardDescription>Each fixture can only be recorded once.</CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <form className="grid gap-5" onSubmit={handleRecordResult}>
                <Field label="Fixture">
                  <select
                    required
                    value={resultForm.fixtureId}
                    onChange={(event) => setResultForm({ ...resultForm, fixtureId: event.target.value })}
                    className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <option value="">Select fixture</option>
                    {upcomingFixtures.map((fixture) => (
                      <option key={fixture.id} value={fixture.id}>R{fixture.round} · {fixture.homeTeam.name} vs {fixture.awayTeam.name}</option>
                    ))}
                  </select>
                </Field>
                {selectedFixture ? (
                  <div className="rounded-2xl bg-muted/70 p-4 text-center">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Round {selectedFixture.round}</p>
                    <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <span className="text-sm font-bold">{selectedFixture.homeTeam.name}</span>
                      <span className="text-xs font-bold text-muted-foreground">VS</span>
                      <span className="text-sm font-bold">{selectedFixture.awayTeam.name}</span>
                    </div>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Home score"><Input required min={0} max={99} type="number" inputMode="numeric" value={resultForm.homeScore} onChange={(event) => setResultForm({ ...resultForm, homeScore: event.target.value })} placeholder="0" /></Field>
                  <Field label="Away score"><Input required min={0} max={99} type="number" inputMode="numeric" value={resultForm.awayScore} onChange={(event) => setResultForm({ ...resultForm, awayScore: event.target.value })} placeholder="0" /></Field>
                </div>
                <Button type="submit" className="h-11 rounded-xl font-bold" disabled={!upcomingFixtures.length || resultMutation.isPending}>
                  {resultMutation.isPending ? "Saving…" : "Save result"}<Check className="size-4" />
                </Button>
                {!upcomingFixtures.length && <p className="text-center text-xs text-muted-foreground">There are no pending fixtures to record.</p>}
              </form>
            </CardContent>
          </Card>
          <Card className="rounded-[22px] border-border/80 bg-card shadow-none">
            <CardHeader className="border-b border-border/70 pb-5">
              <CardTitle className="text-lg">Completed results</CardTitle>
              <CardDescription>Every completed match contributes to the current table.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 p-5">
              {completedFixtures.length ? completedFixtures.map((fixture) => <FixtureRow key={fixture.id} fixture={fixture} />) : <EmptyState icon={ListChecks} title="No results logged" description="Saved match results will appear here with their recorded score." />}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );

  const renderTable = () => (
    <>
      <SectionHeading eyebrow="Automatic league table" title="The table takes care of itself." description={activeLeague ? `${activeLeague.name} · Standard scoring: win 3, draw 1, loss 0.` : "Select a league to view its table."} action={activeLeague && <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-2 text-xs font-bold text-primary"><ShieldCheck className="size-3.5" /> Live standings</div>} />
      <div className="mt-8">{!activeLeague ? <EmptyState icon={Trophy} title="Choose a league first" description="The table is calculated from the results recorded in the active league." action={<Button onClick={() => setLocation("/leagues")} className="rounded-xl">Go to leagues</Button>} /> : <Card className="overflow-hidden rounded-[22px] border-border/80 bg-card shadow-none"><CardHeader className="border-b border-border/70 pb-5"><CardTitle className="text-lg">{activeLeague.name} · {activeLeague.seasonName}</CardTitle><CardDescription className="mt-1">Sorted by points, goal difference, then goals for.</CardDescription></CardHeader><CardContent className="overflow-x-auto p-0"><StandingsTable rows={standings} /></CardContent></Card>}</div>
    </>
  );

  return (
    <div className="mvp-grid min-h-screen bg-background">
      <div className="container py-7 sm:py-10">
        <header className="flex flex-col gap-6 border-b border-border/70 pb-7 sm:flex-row sm:items-start sm:justify-between">
          <div><div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-primary"><span className="grid size-6 place-items-center rounded-lg bg-primary text-[9px] font-black text-primary-foreground">M</span> MVP / DLS operations</div><p className="mt-4 text-sm font-semibold text-muted-foreground">Good morning, admin.</p></div>
          <div className="flex items-center gap-3"><div className="hidden rounded-full border border-border/80 bg-card px-3 py-2 text-xs font-semibold text-muted-foreground sm:flex sm:items-center sm:gap-2"><CircleHelp className="size-3.5 text-primary" /> Foundation mode · Auth ready</div><Button onClick={() => setLocation("/leagues")} variant="outline" size="icon" className="size-10 rounded-xl" aria-label="Create league"><Plus className="size-4" /></Button></div>
        </header>
        <main className="mvp-enter pt-8">{view === "overview" ? renderOverview() : view === "leagues" ? renderLeagues() : view === "teams" ? renderTeams() : view === "fixtures" ? renderFixtures() : view === "results" ? renderResults() : view === "table" ? renderTable() : renderOverview()}</main>
      </div>
    </div>
  );
}

function StandingsTable({ rows, compact = false }: { rows: LeagueDashboard["standings"]; compact?: boolean }) {
  return (
    <table className="w-full min-w-[720px] border-collapse text-left text-sm">
      <thead><tr className="border-b border-border/70 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground"><th className="w-16 px-5 py-4">#</th><th className="px-3 py-4">Team</th><th className="px-3 py-4 text-center">P</th><th className="px-3 py-4 text-center">W</th><th className="px-3 py-4 text-center">D</th><th className="px-3 py-4 text-center">L</th><th className="px-3 py-4 text-center">GF</th><th className="px-3 py-4 text-center">GA</th><th className="px-3 py-4 text-center">GD</th><th className="px-5 py-4 text-center">Pts</th></tr></thead>
      <tbody>{rows.map((row, index) => <tr key={row.teamId} className={`border-b border-border/50 last:border-0 ${index === 0 ? "bg-primary/[0.055]" : ""}`}><td className="px-5 py-4"><span className={`number-display grid size-7 place-items-center rounded-lg text-xs font-bold ${index === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{index + 1}</span></td><td className="px-3 py-4"><div className="flex min-w-[190px] items-center gap-3"><div className={`grid size-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold ${index === 0 ? "bg-primary/20 text-primary" : "bg-secondary text-secondary-foreground"}`}>{row.logoUrl ? <img src={row.logoUrl} alt="" className="size-full rounded-lg object-cover" /> : initials(row.teamName)}</div><span className="font-bold">{row.teamName}</span></div></td><td className="number-display px-3 py-4 text-center text-muted-foreground">{row.played}</td><td className="number-display px-3 py-4 text-center">{row.wins}</td><td className="number-display px-3 py-4 text-center">{row.draws}</td><td className="number-display px-3 py-4 text-center">{row.losses}</td><td className="number-display px-3 py-4 text-center">{row.goalsFor}</td><td className="number-display px-3 py-4 text-center">{row.goalsAgainst}</td><td className={`number-display px-3 py-4 text-center font-semibold ${row.goalDifference > 0 ? "text-primary" : row.goalDifference < 0 ? "text-destructive" : "text-muted-foreground"}`}>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td><td className="number-display px-5 py-4 text-center text-base font-bold">{row.points}</td></tr>)}</tbody>
      {!rows.length && <tbody><tr><td colSpan={10} className="p-10 text-center text-sm text-muted-foreground">No table entries yet. Register teams to begin.</td></tr></tbody>}
    </table>
  );
}
