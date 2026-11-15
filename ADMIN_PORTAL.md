# University Plates admin portal

Production: https://university-plates.vercel.app/admin.html
Public inquiry form: https://university-plates.vercel.app/contact.html

Sign in with an existing, verified, approved account. The initial owner-approved account is `kaidencam@gmail.com`; membership was granted separately from the schema migration. Student onboarding is not required to access the portal.

## What admins can see

- Signup totals, verified-email totals, setup completion and school counts.
- Searchable, paginated directory: account-provided name, email, selected school, signup date and setup status. A school selection is self-reported, not proof of enrollment.
- University inquiries with search, status filters, internal notes and optimistic locking. Updates are recorded in an audit log.

The portal RPCs do not read nutrition targets, meal logs or favorites. User metadata never grants permissions. Admin membership and inquiry tables reside in `admin_private`, with RLS enabled, no direct browser privileges and no direct API access. Every data RPC checks the current authenticated user against verified, non-deleted account membership on the server. Signing out clears rendered private data.

## Approved team access

Only a trusted database operator can add or remove membership. There is no public or browser admin-grant endpoint. Obtain explicit owner approval of the email first, confirm it resolves to one existing verified account, then use:

```sql
insert into admin_private.admin_users(user_id, reason)
select id, 'Owner-approved team member'
from auth.users
where lower(email) = lower('APPROVED_EMAIL_HERE')
  and email_confirmed_at is not null and deleted_at is null
on conflict (user_id) do nothing;
```

To revoke an approved account's admin access, remove its membership using the database operator connection. The next portal request checks current membership; an open browser does not retain server access after revocation. Directory data already viewed cannot be recalled.

## Inquiry handling

The form writes to Supabase, rather than sending email notifications. Admins review submissions in the portal. Fields have server-enforced types, lengths and allowed values; status, timestamps and internal notes are server-controlled. UUID submission references make retries idempotent. A hidden honeypot and transactional hourly limits (3 per normalized email, 10 per forwarded network identifier when present, 60 overall) provide basic abuse resistance. Network headers are supplementary, not a trusted identity. These limits do not replace CAPTCHA or dedicated edge/WAF protection if traffic grows. Failed submissions keep entries for retry; confirmed submissions clear the form.

No real test inquiry is left in production: the live submission check ran inside a rolled-back transaction.

## Deployment and checks

Migration filenames match the versions already recorded in this Supabase project, including the admin migration applied through the Supabase connector. Do not reapply migrations to an existing project.

`npm test` covers database roles, direct-table denial, self-promotion denial, revoked/deleted admin accounts, public inquiry validation/idempotency/rate limits, conflict detection, XSS-safe rendering, sign-out clearing and submission failure/retry. `npm run build` includes `admin.html` in Vite's multi-page output.

Supabase redirect allowlist includes the exact production `/admin.html` URL and `http://127.0.0.1:4181/admin.html`, alongside the existing student-app paths. This uses the existing Google and email sign-in configuration. No service-role key is shipped to the browser.

## Reviewed Supabase notices

[SECURITY DEFINER execution notices](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) are expected for these RPCs: private tables require narrowly scoped functions, explicit grants, a fixed empty search path, validated inputs and server-side membership checks. The [anonymous function notice](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) is intentional only for the validated inquiry submission endpoint, which returns an acknowledgement rather than stored contact data. [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) on `admin_private` intentionally denies all direct client access.

The pre-existing [leaked-password protection notice](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains unchanged. This release uses existing Google/email sign-in and does not introduce password registration or change Auth's security settings.
