# BACKEND — APIs, security and data

SilentSignals is a full-stack Next.js application. Backend code runs only on the server even
though it shares the same `apps/web` project as the frontend.

## Backend entry points

- `src/app/api/reports` — report creation
- `src/app/api/cases` — private reporter access, messages and evidence
- `src/app/api/reviewer` — staff authentication, queue and case operations

## Backend services

- `src/server/database.ts` — Postgres connection
- `src/server/security.ts` — encryption, hashes and credential generation
- `src/server/sessions.ts` — reporter and reviewer sessions
- `src/server/case-service.ts` — case data, messages and authorization
- `src/server/rate-limit.ts` — abuse protection
- `migrations` — production database schema
- `scripts` — migration and reviewer-account utilities

Secrets belong in `.env.local` during development and in Vercel Environment Variables after
deployment. They must never be added to frontend components or committed to Git.
