# SilentSignals

SilentSignals is a privacy-first grievance and whistleblower platform for educational institutions.

## Requirements

- Node.js 24
- pnpm 11
- Git

## Local development

```powershell
pnpm install
pnpm dev
```

Open `http://localhost:3000` for local development. Localhost is only the development environment; preview and production releases are deployed through Vercel.

## Quality checks

```powershell
pnpm check
```

## Secure case service

The production path includes encrypted anonymous reports, private evidence, reviewer roles,
server-side sessions, scoped case queues, assignment and status workflows, anonymous
two-way messaging, audit events, and rate-limited access. Report bodies, message bodies, and
original evidence filenames are encrypted with AES-256-GCM before database storage. Access
keys and staff passwords are stored as scrypt hashes; raw IP addresses are never stored.

### Code map

- Frontend pages and dashboards: `apps/web/src/features` and `apps/web/src/app/*.tsx`
- Backend API routes: `apps/web/src/app/api`
- Server security, sessions, governance, and case logic: `apps/web/src/server`
- PostgreSQL schema changes: `apps/web/migrations`

Governance accounts can create five-seat reviewer teams and approve pseudonymous reviewer
registrations, but are deliberately blocked from case, evidence, and conversation APIs. A
registration needs two different governance approvals. Only the assigned Lead Reviewer can
reply to an anonymous reporter; the other four team members can read the thread and collaborate
through encrypted team-only notes. Reports concerning leadership are routed only to a full
Independent Oversight team.

1. Provision Postgres from the Vercel Marketplace (Neon is supported).
2. Create a **Private** Vercel Blob store and connect it to the project.
3. Copy `apps/web/.env.example` to `apps/web/.env.local` and set the server-only values.
4. Apply the committed schema with `pnpm --filter @silentsignals/web db:migrate`.
5. Bootstrap two governance accounts after setting `SILENTSIGNALS_REVIEWER_PASSWORD` in the
   current shell. Two accounts are required for the two-person approval rule:

```powershell
pnpm --filter @silentsignals/web reviewer:create -- --email=dean@example.edu --name="Dean Reviewer" --role=administrator --scope=all
pnpm --filter @silentsignals/web reviewer:create -- --email=vc@example.edu --name="VC Reviewer" --role=administrator --scope=all
```

The public report and tracking interfaces use an encrypted, device-local preview when the
database is not configured. Reviewer operations and durable cross-device cases require the
production services above.

## Vercel

Import the GitHub repository in Vercel and set the project Root Directory to `apps/web`.

Environment-specific secrets must be configured in Vercel and must never be committed to Git.
