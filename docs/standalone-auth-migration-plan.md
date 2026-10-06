# MVP Standalone Authentication Migration Plan

**Status:** Planning only — no production authentication or deployment changes made.

## Executive conclusion

The public MVP domain is not protected by a hosting-level Manus login gate. An anonymous request to the published domain returns the MVP application directly with HTTP 200.

The Manus step is caused by the MVP application itself:

1. `DashboardLayout.tsx` renders the MVP login/signup screen when there is no session.
2. Its buttons call `startLogin()`.
3. `client/src/const.ts` builds a redirect to `${VITE_OAUTH_PORTAL_URL}/app-auth`.
4. The current deployment sets `VITE_OAUTH_PORTAL_URL=https://manus.im`.
5. `server/_core/oauth.ts` exchanges the Manus authorization code and creates the MVP session.

Therefore, changing or hiding the frontend screen would not meet the requirement. MVP must eventually add an MVP-owned credential authentication path and then remove Manus OAuth from the normal user flow.

## Current authentication architecture

### Identity and session

- Primary user table: `users`.
- Existing primary key: `users.id` (auto-increment integer).
- Manus identity: `users.openId` (currently required and unique).
- Profile fields: `name`, `email`, `loginMethod`, `playerId`.
- Authorization fields: `role` (`admin` or `participant`) and `accountTypeSelected`.
- Current browser session: signed Manus-derived JWT stored in `app_session_id`.
- Server authentication: `server/_core/context.ts` calls `sdk.authenticateRequest(req)`.
- OAuth callback: `server/_core/oauth.ts` calls Manus token exchange and `db.upsertUser()`.
- OAuth configuration: `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID` in `.project-config.json`.

The current app has no MVP-owned password signup, password login, reset-token flow, email verification flow, or database-backed local session table.

### Existing user relationships

The canonical `users.id` must remain unchanged. These records reference it:

| Table | Column | Meaning | Preservation rule |
|---|---|---|---|
| `leagues` | `createdBy` | League owner | Never change during auth migration |
| `leaguePlayers` | `userId` | League participation/profile owner | Never change during auth migration |
| `fixtureResults` | `submittedBy` | Result submitter | Never change during auth migration |
| `fixtureResults` | `confirmedBy` | Result confirmer | Never change during auth migration |
| `fixtureResults` | `resolvedBy` | Admin resolver | Never change during auth migration |
| `notifications` | `userId` | Notification recipient | Never change during auth migration |

Teams, fixtures, standings, and result rows are linked through leagues and teams, not directly through authentication identities. No data should be copied or recreated.

## Database findings

The existing `users.email` column exists, but it is nullable and does not have a unique constraint. It is suitable as profile/contact data, but it should not be used as the sole credential identity without an audit and normalization migration.

Existing OAuth accounts may have:

- A populated email.
- A null email.
- An email whose verification status is not represented locally.
- A profile identity that must not be silently merged with a new local account.

## Proposed database design

Keep `users` as the canonical profile and authorization table. Do not delete or recreate existing users.

### 1. Make Manus identity optional during migration

Change `users.openId` from required to nullable while retaining a unique index. MySQL permits multiple `NULL` values in a unique index. Existing Manus users retain their `openId`; new MVP-owned users can have `openId = NULL`.

This change should be made only after confirming every existing row has a stable primary key and after checking for duplicate/invalid identity data.

### 2. Add `localCredentials`

Recommended columns:

- `id` — primary key.
- `userId` — unique foreign key to `users.id`, cascade on delete.
- `email` — normalized lowercase credential email, unique.
- `passwordHash` — scrypt or Argon2id encoded hash; never plaintext.
- `emailVerifiedAt` — nullable timestamp.
- `createdAt`, `updatedAt`.

Using a separate credential table avoids changing the meaning of the existing profile email and prevents accidentally claiming an existing OAuth account based only on an unverified email.

### 3. Add `authSessions`

Recommended columns:

- `id` — primary key.
- `userId` — foreign key to `users.id`.
- `tokenHash` — unique SHA-256 hash of a random opaque session token.
- `expiresAt`.
- `lastSeenAt`.
- `revokedAt` — nullable timestamp.
- `createdAt`.
- Optional metadata such as user-agent hash and IP hash for security review, without storing unnecessary raw personal data.

Only the raw random token goes into the secure cookie. The raw token must not be stored in the database or logs.

### 4. Add `authTokens`

One-time hashed tokens for:

- `email_verification`.
- `password_reset`.

Recommended columns:

- `id`.
- `userId`.
- `type` enum.
- `tokenHash` unique.
- `expiresAt`.
- `consumedAt` nullable.
- `createdAt`.

Tokens must be generated with cryptographically secure randomness, stored only as hashes, expire quickly, and be single-use.

### 5. Optional persistent rate limiting

Because production may run more than one server process, in-memory rate limiting is not sufficient. Add a small `authRateLimits` table or use a managed rate-limit service to protect login, signup, password reset, and verification endpoints by normalized email and IP hash.

## Existing-user migration

Existing OAuth users retain the same `users.id`, `playerId`, role, profile, league ownership, league memberships, result history, and notifications.

### Recommended migration path

1. Keep Manus OAuth enabled in a temporary **dual-auth phase**.
2. Existing users sign in through Manus as they do today.
3. After successful OAuth login, if the user has no local credential, show a secure **Set up MVP password** prompt.
4. If the OAuth profile contains an email, send a verification link before enabling local login for that email.
5. If no email exists, require the user to enter an email while still authenticated through Manus, then verify it by email.
6. After verification, create a `localCredentials` row linked to the existing `users.id` and let the user choose a password.
7. Do not automatically merge a new signup with an existing OAuth user solely because the email strings match unless the email has been verified and the user explicitly confirms account linking.
8. Continue allowing OAuth login during the migration window so users are not locked out.
9. Once migration coverage is acceptable, disable Manus OAuth for normal users behind a feature flag, while retaining a controlled recovery path until all accounts are migrated.

Users with no verified email must have an explicit recovery path. They must not be silently duplicated or reassigned.

## New-user signup

The MVP signup screen should collect:

- Name.
- Email.
- Password.
- Password confirmation.

The server should:

1. Normalize the email.
2. Validate password policy.
3. Check the local credential email without revealing whether an account exists in an unsafe way.
4. Create `users` and `localCredentials` in one transaction.
5. Generate the existing unique `playerId`.
6. Set the initial role/account setup consistently with the current Admin/Participant flow.
7. Send an email-verification link.
8. Avoid granting sensitive access until email verification policy is satisfied, if that policy is enabled.

The new user must receive a new `users.id`; no existing row is modified.

## Login and logout

### Login

- MVP login form submits email and password to a protected server procedure or dedicated server route.
- Normalize email before lookup.
- Verify the password using constant-time-safe password verification.
- Return a generic failure message such as “Invalid email or password.”
- Do not reveal whether an email exists.
- Apply rate limiting and temporary lockout/backoff after repeated failures.
- Rotate/create a new opaque session token after successful login.
- Preserve the existing role and account setup fields from the linked `users` row.

### Logout

- Revoke the current database session.
- Clear the MVP session cookie.
- Invalidate the client auth query.
- Keep logout idempotent.

### Cookie requirements

Use an MVP-owned cookie, for example `mvp_session`:

- `HttpOnly`.
- `Secure` in production.
- `SameSite=Lax` for the normal same-site web flow.
- `Path=/`.
- No broad domain unless a deliberate multi-subdomain design requires it.
- Reasonable finite expiry with server-side revocation.

The existing `app_session_id` cookie should remain supported during the dual-auth period but should not be the long-term local-auth cookie.

## Password reset

1. User submits an email address.
2. Always return the same response whether the email exists.
3. If a local credential exists, generate a one-time reset token and store only its hash.
4. Send a reset email through a configured transactional email provider.
5. Token expires quickly and is consumed atomically.
6. New password replaces the old hash and revokes existing sessions.
7. Never log reset URLs, raw tokens, or passwords.

An email provider is not currently configured in this project. A provider and verified sending domain must be selected before production reset and verification emails can work. Suitable options include Resend, Postmark, Amazon SES, or an existing organizational SMTP provider.

## Email verification

- Generate a one-time verification token after signup or email change.
- Store only the token hash.
- Use a configured email provider.
- Mark `localCredentials.emailVerifiedAt` only after successful token validation.
- Make verification idempotent and safe to retry.
- Do not expose whether a verification email belongs to an account.

## Authorization preservation

Authentication identity and authorization remain separate:

- `users.id` remains the canonical identity.
- `users.role` remains `admin` or `participant`.
- `leagues.createdBy` remains the existing owner.
- Admins can manage only leagues they own and can participate elsewhere.
- Participants cannot create or manage leagues.
- `leaguePlayers`, `fixtureResults`, and `notifications` continue pointing to the same `users.id`.

No role or ownership migration should be part of the credential migration.

## Files that will eventually change

### Backend

- `drizzle/schema.ts` — nullable Manus identity plus local credential/session/token tables.
- New `drizzle` migrations — additive changes only, with a carefully reviewed nullable-column migration.
- `server/db.ts` — local credential lookup, user creation, session persistence, and migration helpers.
- New `server/auth-local.ts` — password hashing, signup, login, reset, verification, and session operations.
- `server/_core/context.ts` — authenticate MVP sessions first, then optionally fall back to Manus OAuth during dual-auth.
- `server/_core/oauth.ts` — retain temporarily for existing-user migration and rollback.
- `server/_core/cookies.ts` — add local session cookie settings.
- `server/routers.ts` — local auth procedures with generic error handling.
- New auth tests — signup, duplicate email handling, password verification, logout, session revocation, reset token expiry, email verification, rate limiting, and authorization preservation.

### Frontend

- `client/src/const.ts` — add MVP-local auth calls; do not send normal login to `manus.im` after cutover.
- `client/src/components/DashboardLayout.tsx` — replace the Manus login buttons with MVP login/signup forms and migration messaging during dual-auth.
- New auth UI components/pages — signup, login, set-password, forgot-password, reset-password, and verify-email states.
- `client/src/_core/hooks/useAuth.ts` — consume the MVP session and preserve role/account setup behavior.

### Configuration

- Add an auth mode feature flag, for example `AUTH_MODE=dual`, `local`, or `oauth`.
- Add a separate session secret rather than reusing unrelated secrets without a deliberate rotation plan.
- Add transactional email provider secrets only through the deployment secret manager.
- Keep the same `DATABASE_URL`.
- Keep the public domain and configure the email provider’s sending domain and callback URLs.

## Rollback strategy

1. Deploy schema changes additively first; do not drop `openId` or OAuth code.
2. Keep `AUTH_MODE=dual` while testing.
3. If local auth fails, set `AUTH_MODE=oauth` to return to the existing OAuth flow.
4. Existing users remain attached to the same rows throughout rollback.
5. Do not delete `localCredentials`, sessions, or token tables during rollback; they can be disabled and inspected safely.
6. Only remove Manus OAuth after a separate migration milestone confirms account coverage, password reset delivery, and recovery procedures.

## Deployment considerations

The current Manus-hosted public domain already serves the MVP app without a hosting-level login. The standalone experience requires changing the application authentication flow, not bypassing the host.

Before production cutover:

- Use the same existing database.
- Verify the public domain serves the MVP login screen anonymously.
- Verify signup and login in a fresh/incognito browser.
- Verify an existing migrated user can log in locally.
- Verify league ownership, memberships, results, standings, and notifications remain unchanged.
- Confirm the transactional email provider is configured and tested.
- Run the full test suite and production build.
- Keep the OAuth rollback flag available until the migration is proven.

## Recommended next implementation step

Implement the database migration and dual-auth foundation first, without removing Manus OAuth:

1. Add `localCredentials`, `authSessions`, and `authTokens` tables.
2. Make `users.openId` nullable without changing existing values.
3. Add local password hashing and MVP session primitives.
4. Add signup/login/logout tests and an existing-user set-password migration test.
5. Keep the current Manus flow as the fallback.
6. Only after those tests pass, add the frontend MVP login/signup screens and email provider integration.

No production authentication change should be enabled until the dual-auth tests and existing-user migration path are verified.


## Stage 1 implementation status

Stage 1 is now implemented without switching the user-facing authentication flow.

### Added migration

Migration `0008_mature_blockbuster.sql` adds these tables:

- `localCredentials`
  - `id` primary key
  - `userId` unique foreign key to `users.id` with cascade delete
  - `email` unique normalized credential email
  - `passwordHash` text field for encoded scrypt hashes
  - `emailVerifiedAt`
  - `passwordSetAt`
  - `passwordChangedAt`
  - `createdAt`, `updatedAt`
- `authSessions`
  - `id` primary key
  - `userId` foreign key to `users.id`
  - unique `tokenHash`
  - `expiresAt`, `lastSeenAt`, `revokedAt`
  - `createdAt`, `updatedAt`
- `authTokens`
  - `id` primary key
  - `userId` foreign key to `users.id`
  - `type` enum: `password_reset` or `email_verification`
  - unique `tokenHash`
  - `expiresAt`, `consumedAt`, `revokedAt`, `createdAt`

The migration also changes `users.openId` to nullable while preserving all existing Manus `openId` values. It contains no destructive drop, delete, or user-recreation operation.

### Implemented primitives

`server/local-auth.ts` now provides:

- Password hashing with Node’s built-in scrypt using a random salt and explicit cost parameters.
- Constant-time password verification.
- Cryptographically random opaque tokens.
- SHA-256 token hashing before database storage.
- Local session creation, validation, expiry checks, last-seen updates, and revocation.
- Atomic one-time token consumption with expiry, consumed, and revoked checks.
- Local credential lookup by normalized email.

`server/email.ts` defines the future transactional-email boundary. It deliberately returns `not_configured` when no provider is configured and never pretends that an email was sent.

### Configuration reserved for the future email provider

These variables are documented and read as optional configuration, but delivery is not enabled:

- `EMAIL_PROVIDER`
- `EMAIL_FROM`
- `EMAIL_API_KEY`
- `EMAIL_API_URL`
- `APP_PUBLIC_URL`

An explicit provider adapter and verified sending domain are still required before password-reset or verification messages can be enabled.

### Production preservation checks

Before applying the migration, the live database was inspected. The existing database contained:

- 4 users
- 3 leagues owned by 3 distinct users
- 4 league memberships across 4 users
- 2 notifications belonging to 1 user
- Existing foreign keys from `leagues`, `leaguePlayers`, `fixtureResults`, and `notifications` to `users`

The migration was applied additively. The new integration test creates and removes only a temporary local-auth user, then verifies that the pre-existing user rows, league ownership rows, memberships, and notifications are unchanged.

### Current authentication behavior

Manus OAuth remains active and unchanged for the current user-facing login. The local-auth primitives are not wired into `server/_core/context.ts`, `client/src/const.ts`, or the current login buttons yet. No user is automatically migrated, no password is assigned, and no existing `openId` is deleted.

### Rollback

Because the migration is additive, rollback of this stage is configuration/code-level only: leave Manus OAuth active and stop using the new tables. The new tables can remain empty and be inspected safely. Do not drop them during an auth incident; remove them only in a separately reviewed cleanup migration after the full local-auth rollout.
