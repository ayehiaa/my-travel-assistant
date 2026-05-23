# Architect Notes: Hide Gmail Import

**Branch**: `010-hide-gmail-import` | **Date**: 2026-05-22

---

## Overview

Pure UI removal. Two component files changed, no files created, no backend touched, no DB migration, no new tests. The Gmail backend (API routes, OAuth callback, lib files) is fully preserved — only the entry-point button and its prop wiring are deleted.

---

## Backend Tasks

**None.** No API routes, Supabase queries, Zod schemas, or audit log calls are modified. The following files are explicitly out of scope:

| File | Reason retained |
|------|-----------------|
| `src/app/api/gmail/auth-url/route.ts` | Premium-gated route; kept intact |
| `src/app/api/gmail/import/route.ts` | Gmail import processing; kept intact |
| `src/app/api/gmail/trips/route.ts` | Gmail trip candidates; kept intact |
| `src/app/gmail/callback/route.ts` | OAuth callback; kept intact |
| `src/app/gmail/review/page.tsx` | Review page; kept intact |
| `src/lib/gmail.ts`, `gmailParser.ts`, `gmailCrypto.ts` | Parsing + crypto; kept intact |
| `src/proxy.ts` line 36 | `/gmail/callback` allow-rule; kept intact |

---

## Frontend Tasks

### File 1: `src/components/dashboard/DashboardHero.tsx`

**Change type**: Remove prop + JSX block  
**Estimated lines removed**: ~9

#### Task A — Remove prop from interface and destructuring

```tsx
// BEFORE (line 14)
interface Props {
  ...
  onImportFromGmail?: () => void
}

export default function DashboardHero({
  ..., onLogPastTrip, onImportFromGmail
}: Props) {

// AFTER
interface Props {
  ...
  // onImportFromGmail removed
}

export default function DashboardHero({
  ..., onLogPastTrip
}: Props) {
```

**What to check**: TypeScript will fail if `onImportFromGmail` is still referenced anywhere in the component body after this change.

#### Task B — Remove JSX button block

```tsx
// BEFORE (lines 79–86)
{onImportFromGmail && (
  <button
    onClick={onImportFromGmail}
    style={{ background: 'rgba(255,255,255,.10)', color: 'white', border: '1px solid rgba(255,255,255,.25)', borderRadius: 'var(--r)', padding: '12px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--sans)' }}
  >
    Import from Gmail
  </button>
)}

// AFTER
// (entire block removed)
```

**What to check**: The `<div style={{ display: 'inline-flex', gap: 10 }}>` wrapper (line 66) now contains exactly two children — `+ Plan a new trip` link and `+ Log a past trip` button. Both remain. The wrapper itself stays.

---

### File 2: `src/components/dashboard/DashboardClient.tsx`

**Change type**: Remove handler function + prop pass-through  
**Estimated lines removed**: ~10

#### Task C — Remove `handleImportFromGmail` handler

```tsx
// BEFORE (lines 33–41)
async function handleImportFromGmail() {
  const res = await fetch('/api/gmail/auth-url')
  if (!res.ok) {
    toast('Failed to connect to Gmail', 'error')
    return
  }
  const { url } = await res.json()
  window.location.href = url
}

// AFTER
// (entire function removed)
```

**What to check**: The `toast` import via `useToast()` (line 31) may become unused if nothing else calls it. Check whether `toast` is used elsewhere in `DashboardClient.tsx`. If not, remove `const toast = useToast()` and the `useToast` import to avoid lint errors.

> **Observation from current code**: `toast` is only used inside `handleImportFromGmail`. After removing the function, `const toast = useToast()` on line 31 and the `useToast` import on line 6 must also be removed or the linter will flag unused variables.

#### Task D — Remove prop from `<DashboardHero>`

```tsx
// BEFORE (line 54)
onImportFromGmail={role === 'premium' ? handleImportFromGmail : undefined}

// AFTER
// (line removed)
```

**What to check**: The `role` prop on line 49 must remain — it is still used by `DashboardHero` for the assistant greeting path and other rendering. Only the `onImportFromGmail` line is removed.

---

## Cross-cutting Notes

### Unused import cleanup (DashboardClient.tsx)

After removing `handleImportFromGmail`, two additional lines become dead:

| Line | Content | Action |
|------|---------|--------|
| 6 | `import { useToast } from '@/context/ToastContext'` | Remove if `toast` is no longer called |
| 31 | `const toast = useToast()` | Remove alongside the import |

`npm run lint` (ESLint with `no-unused-vars`) will catch this if missed — treat T006 in tasks.md as the verification step.

### No role model changes

`UserRole` in `src/types/database.ts` is unchanged. The `'premium'` role value referenced on line 54 of `DashboardClient.tsx` is only used in the removed prop expression — after deletion, no `'premium'` literal remains in either file.

### Reversibility

To restore the Gmail import button in future:
1. Add `onImportFromGmail?: () => void` back to `DashboardHero` Props and destructuring.
2. Re-add the JSX `{onImportFromGmail && <button>…</button>}` block.
3. Re-add `handleImportFromGmail` to `DashboardClient`.
4. Re-add `onImportFromGmail={role === 'premium' ? handleImportFromGmail : undefined}` to the `<DashboardHero>` call.
5. Re-add `useToast` import and `const toast = useToast()`.

No backend work required.

---

## Quality Gate

| Check | Command | Expected |
|-------|---------|----------|
| Type safety | `npm run build` | Zero errors |
| Lint | `npm run lint` | Zero warnings/errors |
| Tests | `npm test` | All pass (no test files affected) |
