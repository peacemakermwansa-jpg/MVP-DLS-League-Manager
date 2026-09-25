# MVP — DLS League Manager

MVP is the first-stage foundation for managing Dream League Soccer competitions. It gives authenticated league administrators a focused workspace for creating leagues, registering teams, generating home-and-away fixtures, recording scores, and reviewing an automatically calculated table.

## Included in this stage

- Secure Manus OAuth authentication with login, account creation through the provider, logout, and a protected dashboard.
- Basic authenticated profile display with the user's name and email in the workspace menu.
- League creation with league name, season name, and team limit.
- League ownership enforced in the database and every league procedure: users can only view, edit, or delete their own leagues.
- Team registration with team name, manager/player name, optional logo URL, edit, and remove actions.
- Double round-robin fixture generation. Every registered pair receives a home and an away fixture.
- Result entry with validation and duplicate-result protection.
- Automatic standings using 3 points for a win, 1 for a draw, and 0 for a loss.
- Table sorting by points, goal difference, goals for, then team name.
- Normalized MySQL/TiDB schema through Drizzle ORM.
- Cross-user isolation tests covering a complete Account A workflow and Account B access attempts.

WhatsApp integration, payments, advanced statistics, and other nonessential features are intentionally out of scope for this stage.

## Project structure

```text
client/src/App.tsx                         Routes and application providers
client/src/components/DashboardLayout.tsx  Auth gate, profile menu, and responsive sidebar
client/src/components/LeagueWorkspace.tsx  League, team, fixture, result, and table UI
client/src/pages/Home.tsx                  Workspace page entry
client/src/index.css                       MVP visual system and responsive styling
drizzle/schema.ts                          Users, owned leagues, teams, and fixtures
server/league.ts                            Ownership-aware CRUD and league calculations
server/routers.ts                           Protected typed tRPC procedures
server/auth.protected.test.ts               Unauthenticated route coverage
server/league.ownership.test.ts             Account isolation integration test
server/league.test.ts                       Fixture and standings unit tests
```

## Authentication and authorization

MVP uses the configured Manus OAuth flow. The existing `/api/oauth/callback` endpoint creates or updates the authenticated user record and establishes the session cookie. The dashboard is protected at the layout boundary: unauthenticated visitors see the login/account-creation screen instead of league data.

All league procedures use `protectedProcedure` and pass `ctx.user.id` into the data layer. The data layer verifies `leagues.createdBy = ctx.user.id` before returning or mutating a league, team, fixture, or result. Unauthorized access returns a not-found response rather than leaking another user's league existence.

The ownership relationship is:

```text
User (users.id)
  └── League (leagues.createdBy)
        └── Teams (teams.leagueId)
              └── Fixtures (fixtures.leagueId, homeTeamId, awayTeamId)
```

## Database structure

| Table | Purpose |
| --- | --- |
| `users` | Manus OAuth users and future administrator roles. |
| `leagues` | Competition name, season name, team limit, required owner, and timestamps. |
| `teams` | Team name, manager/player, optional logo URL, and league scope. Team names are unique within a league. |
| `fixtures` | Home/away pairing, round, pending/completed status, scores, and played timestamp. Foreign keys cascade from leagues and teams. |

`leagues.createdBy` is non-null and references `users.id` with cascade deletion. Migration `0002_odd_chameleon.sql` backfills legacy unowned leagues to the first existing account before enforcing the constraint.

Important league data is stored in the database; browser storage is only used for the collapsible sidebar width.

## Run and test locally

Install dependencies:

```bash
pnpm install
```

Start the development server:

```bash
pnpm dev
```

Run the type checker:

```bash
pnpm check
```

Run unit and integration tests:

```bash
pnpm test
```

The ownership integration test requires `DATABASE_URL`. It creates temporary Account A and Account B records, runs the league flow through Account A, verifies the calculated table, and confirms Account B cannot list, open, edit, or add teams to Account A's league. Temporary test accounts and their cascaded data are deleted during teardown.

Create a production build:

```bash
pnpm build
```

For a configured database, generate migrations with `pnpm drizzle-kit generate` and apply them using the project's configured Drizzle migration workflow. The checked-in SQL migrations are in `drizzle/0000_fluffy_white_tiger.sql`, `drizzle/0001_famous_toad_men.sql`, and `drizzle/0002_odd_chameleon.sql`.

## Remaining limitations

Authentication currently uses Manus OAuth rather than a custom password form. The provider's secure flow handles both login and new-account creation. The first stage does not yet include email/password authentication, password reset, user invitations, role-specific admin panels, image uploads, match dates/venues, advanced statistics, payments, or WhatsApp automation. League deletion is available to the owner and cascades its teams and fixtures by design.
