/**
 * App-wide feature switches.
 *
 * GMAIL_IMPORT_ENABLED — Gmail trip import is hidden for now. The code (OAuth, parsing, review page, API
 * routes) is kept so the feature can come back by flipping this to true. While false:
 *   - no "Import from Gmail" entry point is rendered anywhere;
 *   - /gmail/review and /gmail/callback redirect to the dashboard;
 *   - the /api/gmail/* routes return 403 (via limitsFor(...).gmailImport);
 *   - plan descriptions and invitation emails don't mention Gmail.
 */
export const GMAIL_IMPORT_ENABLED = false
