# Feature Specification: Agents Pipeline Demo — Anthropic API

**Feature Branch**: `074-agents-anthropic-api`

**Created**: 2026-05-29

**Status**: Draft

**Input**: Refine agents pipeline demo to use Anthropic API instead of Claude Code CLI so it can run on Vercel without localhost.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Executive watches live demo on Vercel (Priority: P1)

An executive opens the `/agents` page on the Vercel-hosted app, enters a one-line feature requirement, clicks Run, and watches each pipeline phase light up with live AI-generated content streaming in real time — without anyone running a local server.

**Why this priority**: This is the entire purpose of the feature. The demo must work on the deployed Vercel URL.

**Independent Test**: Visit `/agents` on the Vercel preview URL, run a requirement, confirm phases progress and text streams.

**Acceptance Scenarios**:

1. **Given** a `premium_plus` user on the Vercel-deployed app, **When** they submit a requirement, **Then** the pipeline runs end-to-end (specify → backend → frontend) and each phase shows streamed content.
2. **Given** the pipeline is running, **When** each agent responds, **Then** the generated text appears character-by-character in a live output panel below the pipeline diagram.
3. **Given** the pipeline completes, **When** all phases are done, **Then** a success banner appears with elapsed time.

---

### User Story 2 — Full pipeline with quality phase (Priority: P2)

A user enables the "Full pipeline" toggle, which adds the security + quality phase after frontend, generating a security checklist and test plan for the requirement.

**Why this priority**: Demonstrates the complete agentic workflow to executives who want to see the full picture.

**Independent Test**: Enable "full pipeline" toggle and confirm the quality phase node appears and completes.

**Acceptance Scenarios**:

1. **Given** the "Full pipeline" checkbox is checked, **When** the pipeline runs, **Then** a quality phase node appears and executes after frontend.
2. **Given** the quality phase is active, **When** the agent responds, **Then** security checklist content streams live.

---

### Edge Cases

- What happens when `ANTHROPIC_API_KEY` is missing? → API route returns 500 with a clear error message.
- What happens when the Anthropic API returns an error mid-stream? → `error` SSE event is sent, pipeline stops, error banner shown.
- What if the user navigates away mid-run? → Stream is cancelled; no orphaned processes (no subprocess to clean up).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The pipeline MUST execute using direct Anthropic API calls, with no dependency on the `claude` CLI binary or local session files.
- **FR-002**: The pipeline MUST stream text output from each agent phase to the browser in real time via SSE `text_delta` events.
- **FR-003**: The frontend MUST display a live output panel showing the streaming content of the currently active phase.
- **FR-004**: The pipeline MUST run end-to-end on Vercel when `ANTHROPIC_API_KEY` is set as an environment variable.
- **FR-005**: All existing phase names, ordering, auth checks, and role gates MUST remain unchanged.
- **FR-006**: The `full` toggle MUST continue to gate the quality phase as before.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The demo runs successfully on a Vercel preview URL with zero localhost dependency.
- **SC-002**: Each phase's generated content is visible to the viewer within 2 seconds of the phase starting.
- **SC-003**: A complete default run (3 phases) finishes within 60 seconds under normal API conditions.
- **SC-004**: `npm run build` and `npm run lint` pass with zero errors after the change.

## Assumptions

- `ANTHROPIC_API_KEY` will be configured in the Vercel project's environment variables by the deployer.
- The demo does not write files to disk — agents generate content as text output only (Vercel functions are stateless).
- The existing `premium_plus` role gate remains the access control for the `/agents` page.
- The `@anthropic-ai/sdk` package already installed at `^0.92.0` is sufficient.
