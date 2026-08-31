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

1. Provision Postgres from the Vercel Marketplace (Neon is supported).
2. Create a **Private** Vercel Blob store and connect it to the project.
3. Copy `apps/web/.env.example` to `apps/web/.env.local` and set the server-only values.
4. Apply the committed schema with `pnpm --filter @silentsignals/web db:migrate`.
5. Create the first reviewer after setting `SILENTSIGNALS_REVIEWER_PASSWORD` in the current
   shell:

```powershell
pnpm --filter @silentsignals/web reviewer:create -- --email=dean@example.edu --name="Dean Reviewer" --role=administrator --scope=all
```

The public report and tracking interfaces use an encrypted, device-local preview when the
database is not configured. Reviewer operations and durable cross-device cases require the
production services above.

## Vercel

Import the GitHub repository in Vercel and set the project Root Directory to `apps/web`.

Environment-specific secrets must be configured in Vercel and must never be committed to Git.
