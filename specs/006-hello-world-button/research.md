# Research: Hello World Button

## Decision: Toast type for "Hello, World!"

- **Decision**: Use `'info'` toast type
- **Rationale**: The message is informational/demo, not a success confirmation or error. `'info'` renders with a neutral dark background (`bg-gray-900`) which is appropriate.
- **Alternatives considered**: `'success'` (green) — rejected as semantically incorrect for a demo button; `'error'` (red) — rejected as misleading.

## Decision: Button placement

- **Decision**: Right-side controls area on desktop; mobile menu section on mobile
- **Rationale**: Follows existing nav conventions. The right side already hosts sign-out and account info. The mobile menu already has a sign-out section.
- **Alternatives considered**: Adding as a nav link in the pill tab group — rejected because "Hello World" is not a navigation destination and adding it as a `Link` with a path would be misleading.

## Decision: No new pure functions, no tests needed

- **Decision**: Skip test file creation
- **Rationale**: Constitution Principle V requires tests only for pure functions encoding business logic. A button click that calls `toast()` has no business logic to isolate and test.
- **Alternatives considered**: Integration test — rejected per project convention (no infrastructure mocking).
