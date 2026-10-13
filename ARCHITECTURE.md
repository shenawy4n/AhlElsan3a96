# Ahl Elsan3a — Architecture

> This document describes the repository implementation, not a guarantee that every database migration or production setting has been applied. Verify the deployed Supabase project, database grants, RLS policies, and runtime secrets before treating any security control as production-verified.

## 1. Project identity and scope

- **Repository:** `shenawy4n/AhlElsan3a96`
- **Default branch:** `main`
- **Application:** Arabic, RTL-first local services directory for Egyptian communities.
- **Scope:** The current MVP. The directory is managed by authorized platform staff; do not infer that planned booking, payment, or provider self-service capabilities are already implemented.
- **Supabase project reference used for the current configuration:** `axrgehvfhfgksanwrvrw`

The repository's former `ahuelbhmosyrozlaxbgb` reference is stale and must not be copied into new runtime configuration. Confirm the target project in the Supabase dashboard before deploying, and ensure all URL/key pairs belong to that same project.

## 2. High-level system

```text
Browser (React UI / TanStack Router)
        |
        | public reads with publishable key
        | authenticated user session
        v
TanStack Start server functions + middleware
        |
        | validate input / authorize role / rate-limit
        | server-only privileged operations
        v
Supabase
  ├── Auth (user identity and session)
  ├── Postgres (directory, admin roles, reviews, forms, events, settings)
  ├── SQL functions / RPCs (atomic or restricted operations)
  └── Storage (where configured for provider media)
        
Build/runtime: Vite + TanStack Start + Nitro
Deployment target configured by the project tooling: Cloudflare-compatible output
```

The browser and server are separate trust boundaries. Client-side visibility checks improve UX but are not authorization. Sensitive operations must be enforced in server middleware and/or database permissions.

## 3. Application layers

### 3.1 UI and routing

- React 19 and TanStack Router provide the user interface and routing.
- TanStack Query is available for asynchronous server state.
- The interface is Arabic and RTL-oriented.
- Shared UI components are built with the project's Radix/shadcn-style component setup and Tailwind CSS.
- Browser code must use only the publishable Supabase key; never import a server-only module into a client bundle.

### 3.2 Server functions

TanStack Start server functions are the API boundary for operations that need validation, authorization, secrets, or controlled disclosure. Relevant modules include:

- `src/lib/contact.functions.ts` — contact gateway; accepts a provider ID and a constrained contact action.
- `src/lib/reviews.functions.ts` and `src/lib/reviews.server.ts` — public approved-review reads and protected moderation.
- `src/lib/auth-middleware.ts` and `src/lib/auth.server.ts` — server-side role checks.
- `src/lib/rate-limit.server.ts` — rate limiting backed by a database RPC when available.
- Other `src/lib/*.functions.ts` modules — directory, administration, messaging, and public form workflows.

Keep validation close to the server-function boundary. Treat all browser-provided IDs, role values, action names, and other fields as untrusted.

### 3.3 Supabase clients

**Browser client — `src/integrations/supabase/client.ts`**
- Uses the Supabase URL and publishable/anon key.
- Maintains the user auth session.
- The publishable key is not a secret; data access still depends on database grants and RLS.

**Privileged server client — `src/integrations/supabase/client.server.ts`**
- Reads runtime environment variables and uses `SUPABASE_SERVICE_ROLE_KEY` (or the configured compatibility alias).
- The service-role key bypasses Row Level Security.
- Import only from trusted server-side code. Never expose this key, return it to a client, or place it in a `VITE_*` variable.
- Because it bypasses RLS, every operation using this client must have server-side validation and authorization appropriate to the operation.

## 4. Data and persistence

Supabase Postgres is the persistent data store. The generated schema contract is in `src/integrations/supabase/types.ts`; SQL migrations are maintained under `supabase/migrations/`.

The schema types indicate implementation areas including:

- **Directory:** providers, categories, areas, and experience options.
- **Administration:** admin users/roles, audit log, and app settings.
- **Public interactions:** reviews, provider applications, reports/suggestions/messages, and analytics events.
- **Abuse controls:** rate-limit policies and the database function used by the server rate limiter.

The generated TypeScript types are a client-side compile-time contract; they do not create or validate the live database schema. Keep migrations and types aligned, and verify migration status against the intended Supabase project.

### Migration safety

1. Confirm the active project reference and database environment.
2. Review each migration and its grants/policies before applying it.
3. Take a database backup before changes to an existing production database.
4. Apply migrations using the project's approved migration process.
5. Run post-migration checks and application regression tests.
6. Verify critical grants/RLS/RPC behavior directly against the target database.

Do not run broad setup SQL against a populated production database merely to fix one feature. In particular, review `supabase/complete_setup.sql` carefully before considering it for any environment.

## 5. Security boundaries and critical flows

### 5.1 Authentication and authorization

- Authentication establishes the caller's identity.
- `src/lib/auth-middleware.ts` attaches Supabase auth and routes server functions through role-specific checks (moderator, admin, owner).
- The server must derive the effective role from trusted server/database state, not from a role supplied by the browser.
- Protect administrative writes and moderation actions with the narrowest required role.
- Verify database RLS and grants separately; server middleware does not automatically secure direct database access.

### 5.2 Provider contact privacy

The contact gateway in `src/lib/contact.functions.ts` validates the provider UUID and permits only `phone_click` or `whatsapp_click`. It applies rate limiting and calls the `contact_provider` RPC from the server.

Expected minimum-disclosure behavior:
- `phone_click` returns only the primary phone.
- `whatsapp_click` returns only the WhatsApp value.
- Alternate contact fields and unrelated provider data are not returned.
- Public/regular users must not be able to query protected phone fields directly or invoke a privileged contact RPC outside the intended gateway.

These are intended application-level safeguards. They are not proof of live database security. The relevant migrations, function execution grants, table privileges, and RLS must be applied and tested in the active project before launch. Never restore a `phone_reveal` action or treat client-side hiding as data protection.

### 5.3 Reviews and moderation

- New reviews are created with `pending` status.
- Public review queries return approved reviews only.
- Rating summaries should be based only on approved reviews.
- Moderation server functions use role middleware; deletion is more restricted than approve/reject.
- Verify the live review table, policies, and moderation RPCs match the current code.

### 5.4 Public forms and rate limiting

- Public form inputs should be validated server-side and constrained to known form types.
- The rate limiter attempts to use the database `check_rate_limit` RPC and policy table.
- Code contains an in-memory fallback if the database limiter fails or the IP is unknown. In-memory limits are per process/instance and are **not equivalent** to persistent cross-instance limits.
- Monitor and test fallback behavior; do not describe rate limiting as fully persistent unless the database RPC is available and verified.

### 5.5 Secrets and environment configuration

Runtime variables used by the Supabase integration include:

- `VITE_SUPABASE_URL` — URL exposed to the browser build; must point to the intended project.
- `VITE_SUPABASE_PUBLISHABLE_KEY` — publishable key; not a secret.
- `SUPABASE_URL` — server-side URL alias.
- `SUPABASE_PUBLISHABLE_KEY` — server-side publishable key alias, if used.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only secret; never prefix with `VITE_`.
- `SUPABASE_PROJECT_ID` / `VITE_SUPABASE_PROJECT_ID` — metadata/configuration values where consumed; these must match the chosen project.

Set secrets in the hosting provider's secret/environment configuration, not in source control. The committed `.env.example` is only a template and must never contain real secret keys. Keep all Supabase URLs, IDs, and keys pointed at one project per deployment environment.

## 6. Request flows

### Public directory read
1. Browser renders the directory/search UI.
2. Public-safe reads use the browser Supabase client or a server function as appropriate.
3. Supabase grants/RLS determine which records and columns are readable.
4. Do not include protected contact data in public provider queries.

### Contact action
1. Browser submits provider UUID and `phone_click` or `whatsapp_click`.
2. Server schema validation rejects unsupported actions/invalid UUIDs.
3. Server applies rate limiting.
4. Server calls the restricted `contact_provider` RPC using the privileged client.
5. Response contains only the requested contact channel.
6. Database execution grants must prevent direct untrusted invocation of the privileged RPC.

### Admin operation
1. Browser submits an action with the current session.
2. Auth middleware attaches/verifies the session.
3. Server derives the caller's role and rejects unauthorized operations.
4. Server validates the payload and performs the operation.
5. Sensitive changes should be auditable where the relevant audit workflow is implemented.

### Review submission and moderation
1. Public submission is validated and stored as pending.
2. Public reads filter to approved reviews only.
3. Authorized moderators/admins review submissions through protected server functions.
4. Rating aggregates use approved records only.

## 7. Build and deployment

The project uses Vite, TanStack Start, and Nitro through `@lovable.dev/vite-tanstack-config`. The config points TanStack Start to the `server` entry and the configured Nitro build target is Cloudflare-compatible.

Useful scripts from `package.json`:

```bash
npm run dev
npm run lint
npm run build
npm run preview
npm run preview:cf
npm run deploy:cf
```

The Cloudflare preview/deploy scripts expect generated output at `.output/server/wrangler.json`. Verify the actual build artifact and target runtime before deploying; do not assume a successful local build proves production environment variables or database policies are correct.

## 8. Verification checklist before release

- [ ] The repository and branch being deployed are `shenawy4n/AhlElsan3a96` and the intended commit.
- [ ] Browser URL, server URL, and all Supabase keys belong to the same intended project.
- [ ] No service-role/secret key is present in client assets or public environment variables.
- [ ] Database migrations have been applied to the target project and reviewed.
- [ ] Anonymous and regular authenticated users cannot directly read protected provider contact columns.
- [ ] Only the intended roles can invoke privileged RPCs and moderation/admin actions.
- [ ] The contact gateway returns only the requested channel; no `phone_reveal` pathway remains.
- [ ] Persistent rate-limit RPC and policy configuration work; fallback behavior is understood.
- [ ] Public reviews show approved records only; pending/rejected reviews do not affect aggregates.
- [ ] Public forms, provider applications, storage permissions, and audit flows are tested.
- [ ] Run `npm run lint`, `npm run build`, and the repository regression/audit scripts.
- [ ] Investigate every blocked/failed audit result; a blocked test is not a pass.

## 9. Known implementation cautions

- The repository contains an `app/` directory alongside the root application. Confirm which tree is canonical for any code or migration change; do not apply duplicate migrations automatically.
- The checked-in environment example previously referenced the stale Supabase project `ahuelbhmosyrozlaxbgb`. Keep it aligned with the intended project, but independently verify the target project in Supabase before deployment.
- Code-level protections do not prove the live database has matching grants, RLS policies, or migrations.
- A successful build does not replace end-to-end security tests against the live deployment.

## 10. Change policy

This document records the current MVP architecture. Keep changes incremental, preserve existing user-facing behavior unless explicitly requested, and do not add booking, payments, or other future-phase capabilities as part of architecture documentation work.
