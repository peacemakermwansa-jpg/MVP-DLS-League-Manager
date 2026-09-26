# MVP — DLS League Manager

MVP is the first-stage foundation for managing Dream League Soccer competitions. It gives authenticated league administrators a focused workspace for creating leagues, registering teams, generating home-and-away fixtures, recording scores, and reviewing an automatically calculated table.

## Included in this stage

- Secure Manus OAuth authentication with login, account creation through the provider, logout, and a protected dashboard.
- Basic authenticated profile display with the user's name and email in the workspace menu.
- League creation with league name, season name, and team limit.
- League ownership enforced in the database and every league procedure: users can only view, edit, or delete their own leagues.
- Persistent six-digit Player IDs for every account, including legacy accounts backfilled during migration.
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
| `users` | Manus OAuth users, roles, and unique permanent Player IDs. |
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


## Player registration stage

The authenticated product now supports player participation without changing league ownership. A user can have one `leaguePlayers` profile in each league, so the same account can participate across multiple competitions with a different player name, username, team, and registration status per league.

Players can register for a league by its League ID. A league owner adds an existing account by exact Player ID: MVP returns only the player's public name and Player ID for confirmation, never their email. Registrations begin as `pending`. The league owner can approve or reject them, assign an approved player to a team, change the assignment, or remove the registration. Players can update only their own profile fields.

The player centre displays each registration, approval status, assigned team, current position and football record, plus upcoming and completed fixtures. Approved players and league owners can open a team page with its roster and current season statistics. Fixture deadlines are now represented by an optional `fixtures.deadline` field; existing schedules show no deadline until one is set.

### Player permissions

| Action | League owner | Approved/pending player |
| --- | --- | --- |
| View owned league data | Yes | No, unless through player/team views allowed by membership |
| Create/edit/delete own league | Yes | Not for another user's league |
| Generate fixtures or record results | Yes | No for another user's league |
| Add, approve, reject, assign, or remove players | Yes | No |
| Update own player profile | No special need | Yes |
| View own league fixtures and team | Yes | Approved membership only for team pages |

Player-management routes always verify that the authenticated user owns the target league. Direct requests with another user's league or membership ID return an authorization error rather than mutating data.

### New files and routes

```text
server/players.ts                              Membership and team-page data layer
server/player-id.test.ts                       Player ID generation and persistence test
server/player.ownership.test.ts                Player registration and permission integration test
client/src/components/PlayerDashboard.tsx     Player centre and self-registration/profile UI
client/src/components/PlayerManagement.tsx     Owner registration review and team assignment UI
client/src/components/TeamPage.tsx             Protected team detail page
```

The player-membership migration is `drizzle/0003_neat_goblin_queen.sql`. It creates `leaguePlayers`, adds the nullable fixture `deadline`, and adds foreign keys to leagues, users, and teams. Migration `drizzle/0004_classy_king_cobra.sql` adds `users.playerId`, backfills existing accounts from their stable user IDs, and enforces uniqueness.

The current first-stage invitation flow requires the player to have created an account before the owner adds them by exact Player ID. Email/WhatsApp notifications and a separate invitation-token workflow remain intentionally out of scope until the core player registry is stable.

## Player IDs

The `users.playerId` column is a unique, permanent six-digit identifier generated on first OAuth account upsert using a collision-checked random value. Existing users receive deterministic six-digit IDs during `drizzle/0004_classy_king_cobra.sql` backfill, and subsequent logins preserve the stored value. Admin player discovery accepts only an exact Player ID and returns public name/ID fields; email is not accepted or returned by player-management procedures.

The Player Centre displays the signed-in user's Player ID with a copy action. The Player Register screen lets an owner find a player, review the exact name and ID, explicitly confirm the target league, and then add the registration for approval.


## League ID sharing

Every league uses its database-backed `leagues.id` as its unique numeric League ID. Because the column is an auto-increment primary key, new leagues cannot receive the same ID, and existing leagues retain valid numeric IDs. Owners can see the ID on the overview and League management screens and copy it with the **Copy League ID** button. Players enter that exact ID in **Join a league**; MVP verifies the league before enabling the registration request and shows a clear error for an unknown ID.

The player registration integration test covers numeric ID generation, uniqueness across created leagues, valid lookup, self-registration with the exact ID, and invalid-ID rejection.
