

## Stage 2 implementation status: dual-auth MVP login

The next migration stage now supports MVP-owned email/password signup, login, and logout while retaining Manus OAuth as an explicit fallback for existing users.

The server checks the `mvp_session` cookie first. If it contains a valid, unexpired, non-revoked database session, the corresponding canonical `users` row is used. If no valid local session exists, the existing Manus session validation remains available. This preserves current OAuth accounts and scheduled-task behavior.

New MVP accounts are created in the existing `users` table with a new canonical `users.id`, `openId = NULL`, `loginMethod = "mvp"`, and the existing participant default. A unique six-digit Player ID is generated. The credential row is linked to the new user through `localCredentials.userId`. No existing OAuth user is automatically merged, recreated, or changed.

The MVP login screen now provides local email/password login and signup forms. Existing Manus users can still choose the separate Manus fallback link. The normal application authentication flow now has a local path, but the final OAuth removal/cutover has not been performed.

Password reset and email verification are not yet enabled because no transactional email provider is configured. Signup currently establishes a local credential and session without claiming that an email was verified. Before production policy requires verified email access, configure a provider and add the token-email delivery and verification UI.

Rollback remains safe: disable or stop using local auth and retain Manus OAuth. Local sessions can be revoked server-side, while the additive credential/token tables remain intact for inspection. Existing league ownership, membership, role, player, result, standings, and notification relationships remain tied to the same canonical `users.id` values.
