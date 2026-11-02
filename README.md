# AcreMind

A working PHP farm management application with 33 operational registers, staff permissions, linked inventory and payments, reports, alerts, backups and optional external services.

## Start with the guides

- [Using the system and writing record notes](docs/USER_GUIDE.md) — for farm owners and staff.
- [Understanding the code](docs/CODE_GUIDE.md) — folder map, reading order, API actions and annotated examples.

The working source has consistent formatting and numbered explanatory sections. Run `npm run format` to maintain that style, or `npm run format:check` to check it.

## Open the application

Open **http://127.0.0.1:8080** while the local server is running. Create your owner account on the first screen. The main database starts empty so you can enter actual farm records. QA data is kept in a separate test database.

On this Mac, double-click **Start Farm Management.command** to start the application again. Keep the launcher window open while using it.

From a terminal in this folder:

```sh
npm ci
npm start
```

Node.js 20.10+ and npm 10.2.3+ are required. The included PHP WebAssembly runtime removes the need for a native PHP installation. Data is saved to `storage/ffms.sqlite`, not browser storage. The local server listens only on this computer.

## First workflow

1. Create the owner account. In Settings, enter your business name and currency.
2. Register farms and fields. Add crop varieties, then planting records.
3. Register stock items with opening quantities and units.
4. Add suppliers and purchase orders. Managers approve orders; received orders increase stock.
5. Record crop applications, scouting, irrigation and tasks as work happens.
6. Record harvests. Linking a stock item measured in kg adds net harvest after losses.
7. Add a customer and invoice. Confirming the invoice deducts stock; draft and cancelled invoices do not.
8. Record payments against invoices or purchases. Reports distinguish sales from cash receipts and expenses.
9. Register animals, staff, equipment and storage as needed. Review Alerts for upcoming work and low stock.

## Included modules

| Area              | Registers and workflows                                                                                                                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Land and crops    | Farms, coordinates and stored GeoJSON boundaries; fields, soil and land-use notes; crop varieties; planting dates, spacing, density and stages; fertilizer/manure/spray applications; pest observations and treatment results; harvest quantities, grades and losses |
| Livestock         | Animal IDs, breeds, births/deaths, vaccination and treatment history, feed and weight records, breeding and production                                                                                                                                               |
| Resources         | Water sources, irrigation systems/schedules, water and costs, inventory, stock movements, equipment, maintenance/fuel, warehouses and storage lots                                                                                                                   |
| People and work   | Employees, roles, attendance, pay earned, assigned tasks, time and output                                                                                                                                                                                            |
| Trade and finance | Suppliers and agreements, procurement approval, customers, printable invoices, payments, budgets and loans                                                                                                                                                           |
| Insights          | Market-price observations, weather records, live forecasts, map links, yield/revenue estimates, reports and record-driven alerts                                                                                                                                     |
| Administration    | Owner, administrator, manager, agronomist, worker and accountant access; temporary passwords, disabling, recovery, audit history, CSV exports, archive/restore and backups                                                                                           |

## Data rules

- Active fields cannot exceed farm area. Plantings may reuse a field across non-overlapping seasons; overlapping allocations cannot exceed field area.
- References must point to active records in the same business and, where applicable, the same farm.
- Stock = opening quantity + movements + received purchases + linked net harvests − confirmed sales. Stock cannot become negative. Units cannot change after linked transactions exist.
- Payment direction must match its linked order. Payments cannot exceed the order total. Purchases require approval before payment; sales require confirmation.
- Archived records remain stored but are excluded from active calculations. Archive children before parents and restore parents before children. Stock and financial checks also apply to archive/restore actions.
- Record versions prevent stale edits from overwriting changes. Writes are transactional and serialized per business.
- Operational costs and earned pay do not automatically create cash payments. Record payments once when paid to avoid duplicate expenses.
- Storage lots track occupancy and quality. Record stock movements when needed; lots do not duplicate harvest/purchase receipts.

## Staff access

Owners and administrators manage staff and settings. Managers manage operational records and approve procurement. Agronomists work with crop and irrigation records. Accountants manage trade and finance; managers must approve/receive procurement. Workers can update tasks, attendance, feeding, animal health, irrigation and weather observations, but cannot access financial registers.

Permissions cover the business, not individually assigned farms. Staff must replace temporary passwords on first sign-in. Disabling/resetting an account invalidates its sessions. The owner is created once; subsequent public registration is closed.

## Optional services and release boundaries

Configure secrets as server environment variables. Local `npm start` does not automatically load `.env`.

- **Weather:** Enter farm coordinates, then choose Load forecast. Open-Meteo requires internet access but no key. Manual weather records work offline.
- **Maps:** Coordinates open OpenStreetMap. GeoJSON Polygon/MultiPolygon boundaries are stored; a graphical boundary-drawing editor is not included.
- **AI:** Farm Advisor uses Google Gemini. Run `npm run configure-ai` with a Google AI Studio key, or set `GEMINI_API_KEY` and optionally `GEMINI_MODEL` (default `gemini-3.5-flash`). Only questions and aggregate records are sent, when a permitted user requests advice. Contacts, notes and credentials are excluded.
- **Email/SMS:** Set `NOTIFICATION_WEBHOOK_URL` to an HTTPS delivery service and optionally `NOTIFICATION_WEBHOOK_TOKEN`. Alerts includes Send alert summary. The service receives JSON fields `event`, `business`, `created_at`, and `alerts`. Configure recipients and email/SMS delivery in that service. No messages are sent automatically or during tests. No delivery provider was supplied or tested.
- **Payroll:** Export Attendance CSV to your payroll process. A vendor-specific payroll connector is not included.

Planning estimates work without AI. They use completed crop history for the same variety, falling back to entered expectations. Revenue uses the latest recorded market price. They are labelled estimates, not guarantees.

## Backups and recovery

`npm run backup` creates a consistent full SQLite backup under `storage/backups`, including accounts and audit history. Keep private copies outside this computer. Full backups contain password hashes and business data. The Settings download exports records without account credentials.

To restore, stop the server, set `FFMS_RESTORE_FILE` to a full backup and `FFMS_STORAGE` to an empty directory, then run:

```sh
npm run php -- scripts/restore.php
```

The command verifies integrity and refuses to overwrite an existing database. Start the application with that same `FFMS_STORAGE` directory.

For owner recovery, set `FFMS_RECOVERY_EMAIL` and `FFMS_RECOVERY_PASSWORD` in the process environment, then run `npm run php -- scripts/recover.php`. It invalidates sessions and requires a new password at sign-in. Keep passwords out of committed files and shared command history. Administrators can reset staff in Team & access.

## Native PHP and hosting

Use PHP 8.2+ with PDO SQLite (or PDO MySQL) and cURL. Serve only `public/` and make `storage/` writable by the web-server user. Tables initialize automatically with the `ffms_` prefix. Earlier prototype files are retained in `legacy/` and are not loaded.

For MySQL, configure `DB_DSN`, `DB_USER`, and `DB_PASSWORD` from `.env.example`. Create the database first. MySQL support has not been runtime-tested here; local verification used SQLite.

`Dockerfile`, `compose.yaml`, and `deploy/apache.conf` provide Apache/PHP packaging. Run `docker compose up --build` on a computer with Docker. Docker was unavailable here, so the image has not been built or verified. The compose file binds to localhost. Public hosting requires a selected host, HTTPS, protected secrets and durable backups. This application has not been publicly deployed.

## Tests

Run `npm run check` for PHP/JavaScript syntax checks. API tests need a separate database/server:

```sh
FFMS_STORAGE="$PWD/storage/test-run" npm run php -- -S 127.0.0.1:8081 -t public
# In a second terminal:
node tests/integration.mjs
FFMS_STORAGE="$PWD/storage/test-run" npm run php -- scripts/security-fixtures.php
node tests/security.mjs
```

Tests create synthetic data/accounts. Never point `TEST_URL` at a live farm database. The optional `tests/browser.mjs` runner needs a supported Chrome installation; change its executable path for your environment. Browser verification here used the app's browser tools after the standalone runner could not launch Chrome in the sandbox. See `VERIFICATION.md` for results and remaining limits.

## Technical references

- [PHP WebAssembly runtime](https://developer.wordpress.org/playground/developers/local-development/php-wasm-node/)
- [OpenAI Responses API](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)
- [Open-Meteo documentation](https://open-meteo.com/en/docs)

This is a working local first release across the operational areas above. It has not undergone production security audit or real-farm acceptance testing. External integrations require configuration, and the specific release boundaries above remain explicit.

## Administration and recovery update

See [Accounts and recovery](docs/ACCOUNTS_AND_RECOVERY.md) for the admin overview, public account creation, staff accounts and email delivery configuration. See [Image prompts](docs/IMAGE_PROMPTS.md) for the generated section backgrounds.

## Connect Farm Advisor

Run `npm run configure-ai` and enter a Google Gemini API key at the hidden prompt. It is saved in `storage/gemini-config.json` with owner-only permissions. Reload Farm Advisor; a server restart is not required. Environment variables override saved settings. Do not put credentials in `.env.example`, which is only a template. Live advice requires valid API access and available quota.

For public hosting, read [Hosting AcreMind](docs/HOSTING_ACREMIND.md). This package is not a deployed website.
