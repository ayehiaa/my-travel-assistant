# Research: Hide Gmail Import

## Scope

No external unknowns. All research is internal codebase inspection.

## Findings

### Current Gmail import entry points

| File | Location | Role |
|------|----------|------|
| `src/components/dashboard/DashboardHero.tsx` | lines 14, 79–86 | Renders "Import from Gmail" button when `onImportFromGmail` prop is truthy |
| `src/components/dashboard/DashboardClient.tsx` | lines 33–41, 54 | Defines `handleImportFromGmail` handler; passes it to `DashboardHero` for `premium` users only |

### Backend code to retain (no changes)

| File | Purpose |
|------|---------|
| `src/app/api/gmail/auth-url/route.ts` | GET → returns Google OAuth URL; gated to `premium` role |
| `src/app/api/gmail/import/route.ts` | Processes Gmail messages after OAuth |
| `src/app/api/gmail/trips/route.ts` | Returns Gmail-imported trip candidates |
| `src/app/gmail/callback/route.ts` | OAuth callback handler |
| `src/app/gmail/review/page.tsx` | Review page for Gmail-imported trips |
| `src/lib/gmail.ts`, `gmailParser.ts`, `gmailCrypto.ts` | Gmail parsing + crypto utilities |
| `src/proxy.ts` line 36 | Allows `/gmail/callback` through middleware |

### Decision

UI-only removal. Backend stays. No feature flag needed. Approach: remove `onImportFromGmail` prop from `DashboardHero` interface and JSX, remove `handleImportFromGmail` from `DashboardClient`.

**Reversibility**: To restore the button, add back the prop and handler — no backend work required.
