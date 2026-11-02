# Verification record

Verified on 12 September 2026 with PHP 8.5.10 through the bundled PHP WebAssembly CLI, SQLite, and Node.js 24.21.0. Application data and test data use separate storage directories.

## Passed

- PHP syntax checks for the current backend, endpoints and maintenance scripts; JavaScript syntax check.
- 50 integration checks covering record creation across all 33 modules, authentication, CSRF, staff permissions, required password changes, dates, field area limits, stock shortages, invoice overpayments, archive/restore, stale edits, audit records and record-backup export.
- 16 additional security/lifecycle checks: cross-business isolation, stock-unit immutability, non-overlapping future rotations, overlapping-area rejection, procurement approvals, staff disabling/session invalidation, and clear errors for disconnected AI and notification services.
- Complete SQLite backup creation and restoration to an isolated directory. Restored user/record counts match the source. An overwrite attempt is refused and leaves the destination byte-for-byte unchanged.
- Account recovery on the restored test database changes the password hash and requires a password change on next sign-in. The live application account is not modified by this test.
- Browser inspection through Codex browser tools: sign-in, populated dashboard, computed stock balance, inventory edit, persisted edit after reload, production/financial reports, and phone-sized dashboard and registration form.
- PHP cURL successfully fetched a live Open-Meteo response. This checks network transport; it is not an accuracy validation of weather forecasts.
- Dependency-lock consistency and Mac launcher syntax.

## Source readability update

- Added consistent formatting, labelled source sections, explanatory comments, and code and user guides.
- Formatting and syntax checks passed; all 50 integration and 16 security/lifecycle checks passed again after formatting.
- Parsed JavaScript comparison confirmed executable structure is unchanged across seven files.
- No data migration or login change is part of this update.

## Limitations

- The standalone Playwright runner could not launch the installed Chrome inside this desktop sandbox. It is supplied for development environments with a working browser launch setup; it is not reported as passing here.
- Docker and MySQL deployment paths were prepared but not executed. Verified storage is SQLite.
- No OpenAI key or email/SMS delivery webhook was supplied, so no live model request or message delivery was performed. Both endpoints report their disconnected state.
- Public hosting, HTTPS configuration, independent security audit, load testing and real-farm acceptance testing have not been completed.
- The bundled PHP CLI can return a successful process exit code for some PHP-level failures. Syntax checks inspect the actual lint output; restore-refusal tests inspect the message and verify unchanged database bytes.

## Relevant test files

- `tests/integration.mjs`
- `tests/security.mjs`
- `tests/recovery.mjs`
- `tests/browser.mjs` (optional, not passed in this environment)
- `scripts/check.mjs`

Run API tests only against an isolated test database as described in README.md. Source archives exclude stored databases, backups, sessions and credentials.

## Administration and account update

- 50 integration checks, 16 security/lifecycle checks and 34 new account/recovery checks passed on isolated test storage.
- New checks cover separate account registration, admin-only data, business isolation, archived record details, expired/reused reset links, old-password rejection and session invalidation.
- DOM interaction checks passed for account creation/recovery navigation, admin landing and account display, four section image mappings, and opening reset links while signed in.
- Generated background images were visually inspected. Chrome could not launch in this environment, so browser rendering and responsive layout of the new screens have not been visually verified.
- Live reset-email delivery requires a configured service and is not yet verified. Token redemption was tested with test-only fixtures.

- Generated-link flow passed through the private mail bridge with a fake sender: authorization, anonymous responses, token redemption, single use and new-password login. Gmail delivery awaits private user credentials.
