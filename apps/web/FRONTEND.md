# FRONTEND — pages, UI and motion

SilentSignals uses the Next.js App Router, so page entry files stay in `src/app` while the
larger interactive interfaces live in `src/features`.

## Page entry files

- `src/app/page.tsx` — public home page
- `src/app/report/page.tsx` — anonymous report page
- `src/app/track/page.tsx` — private reporter case page
- `src/app/reviewer/page.tsx` — Dean/reviewer workspace page

## Main interface code

- `src/features/report` — report wizard and its styling
- `src/features/track` — reporter case access, evidence, timeline and messaging
- `src/features/reviewer` — staff login, case queue and review workspace
- `src/components` — shared brand and motion components
- `src/app/globals.css` — public-site global styling and design tokens

Files inside `src/app/api` are backend endpoints, not frontend pages.
