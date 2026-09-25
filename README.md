# MVP — DLS League Manager

MVP is the first-stage foundation for managing Dream League Soccer competitions. It gives a league administrator a focused workspace for creating leagues, registering teams, generating home-and-away fixtures, recording scores, and reviewing an automatically calculated table.

## Included in this stage

- Responsive dashboard with MVP branding and mobile-friendly sidebar navigation.
- League creation with league name, season name, and team limit.
- Team registration with team name, manager/player name, optional logo URL, edit, and remove actions.
- Double round-robin fixture generation. Every registered pair receives a home and an away fixture.
- Result entry with validation and duplicate-result protection.
- Automatic standings using 3 points for a win, 1 for a draw, and 0 for a loss.
- Table sorting by points, goal difference, goals for, then team name.
- Normalized MySQL/TiDB schema through Drizzle ORM.
- Existing Manus OAuth scaffolding retained so authentication can be enabled without redesigning the domain model.

WhatsApp integration, payments, advanced statistics, and other nonessential features are intentionally out of scope for this stage.

## Project structure

```text
client/src/App.tsx                         Routes and application providers
client/src/components/DashboardLayout.tsx  Responsive MVP sidebar shell
client/src/components/LeagueWorkspace.tsx  League, team, fixture, result, and table UI
client/src/pages/Home.tsx                  Workspace page entry
client/src/index.css                       MVP visual system and responsive styling
drizzle/schema.ts                          Users, leagues, teams, and fixtures tables
server/league.ts                            Round-robin, CRUD, result, and standings logic
server/routers.ts                           Typed tRPC procedures
server/league.test.ts                      Fixture and standings unit tests
```

## Database structure

| Table | Purpose |
| --- | --- |
| `users` | Existing Manus OAuth users and future administrator roles. |
| `leagues` | Competition name, season name, team limit, optional creator, and timestamps. |
| `teams` | Team name, manager/player, optional logo URL, and league scope. Team names are unique within a league. |
| `fixtures` | Home/away pairing, round, pending/completed status, scores, and played timestamp. Foreign keys cascade from leagues and teams. |

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

Run unit tests:

```bash
pnpm test
```

Create a production build:

```bash
pnpm build
```

For a configured database, generate migrations with `pnpm drizzle-kit generate` and apply them using the project's configured Drizzle migration workflow. The checked-in SQL migrations are in `drizzle/0000_fluffy_white_tiger.sql` and `drizzle/0001_famous_toad_men.sql`.

## Remaining limitations

This foundation does not yet include authentication enforcement, image upload storage, league deletion or schedule regeneration, match dates/venues, advanced statistics, payments, or WhatsApp automation. Team logos currently accept an optional URL rather than an upload flow. Authentication scaffolding remains available for the next stage, but the first-stage workspace is intentionally usable in foundation mode while the core league workflows are being established.
