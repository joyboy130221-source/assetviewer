# Maximo Asset Viewer v3 — Multi Environment + Administration

This version removes the hard-coded Maximo host/API key from the Maximo feature APIs. Maximo environments are stored in PostgreSQL and selected with the `env` URL parameter.

## Required Vercel configuration

Connect a PostgreSQL provider to the Vercel project (for example Neon, Supabase, Prisma Postgres, or another provider that supplies a PostgreSQL `DATABASE_URL`). Then configure these Vercel environment variables:

- `DATABASE_URL` — PostgreSQL connection string supplied by the database integration.
- `SESSION_SECRET` — a long random value used to sign administration login sessions.
- `CREDENTIAL_ENCRYPTION_KEY` — a long random value used to AES-256-GCM encrypt Maximo API keys before they are stored in PostgreSQL.

`MAXIMO_API_KEY` and `MAXIMO_ROOT` are no longer required for normal Maximo calls. Credentials are resolved from `maximo_environments` using the `env` parameter.

> Keep `CREDENTIAL_ENCRYPTION_KEY` stable. Changing/removing it will make previously encrypted Maximo API keys unreadable.

## First startup / default administrator

The schema is created automatically on the first database-backed request. If role/user records are empty, the application bootstraps:

- Username: `admin`
- Password: `Gomake1t!@#123`
- Role: `administrator`
- Enabled administration pages: Role Page, User Page, Maximo API Endpoint Page

Change the default password after first login.

Administration login: `/login.html`

## Maximo Environment Configuration

Open `/maximo-environments.html` after login. Each record contains:

- Environment Name (`env_name`) — URL key, e.g. `demo-coh`
- Description
- Maximo API Endpoint — e.g. `https://host/maximo/api`
- API Key (encrypted in PostgreSQL)
- Active

Example records:

- `demo-coh` → `https://demomaximocoh/maximo/api`
- `demo-dubai` → `https://demomaximodubai/maximo/api`

The application always resolves the endpoint/API key from the environment whose **Environment Name exactly matches `env`**.

## Public Maximo pages

These remain unauthenticated as requested, but now require `env`:

- Asset Viewer: `/?env=demo-coh&assetId=V6-0401`
- Asset Viewer (Dubai): `/?env=demo-dubai&assetId=V6-0401`
- Create Work Order: `/work-order.html?env=demo-coh&assetId=V6-0401`
- Update Work Order: `/work-order-update.html?env=demo-coh&wonum=1330`

The `env` value is forwarded only to the server-side API. The browser never receives the stored Maximo API key.

## Administration and permissions

Only these pages require login:

- `/roles.html`
- `/users.html`
- `/maximo-environments.html`

Role permissions are stored as JSON so another protected administration page can be added later without redesigning the role/user tables. Current permission keys are `roles`, `users`, and `maximoEnvironments`.

Users contain Username, Full Name, Email Address, Password, Active, and Role. Login accepts Username or Email.

## Confirmation / loading UX

Native browser `confirm()` / `alert()` calls were replaced with the shared `ui.js` modal/toast implementation. Create, update, delete, asset update, work-order create, work-order update, and clear-draft actions use the custom confirmation UI. Blocking loading overlays are shown while server/API calls are running.

## Database tables

The application creates:

- `app_roles`
- `app_users`
- `maximo_environments`

Passwords are stored as salted scrypt hashes. Maximo API keys are encrypted with AES-256-GCM using `CREDENTIAL_ENCRYPTION_KEY`.

## Local development

Create `.env.local`:

```
DATABASE_URL=postgresql://...
SESSION_SECRET=replace-with-a-long-random-secret
CREDENTIAL_ENCRYPTION_KEY=replace-with-a-long-random-encryption-secret
```

Then run:

```
npm install
npx vercel dev
```

## Notes

- The current site ID used by the Asset Viewer remains `BEDFORD`, matching the existing application behavior.
- Maximo object structures remain `mxasset`, `mxapiwo`, and `mxapiworklog`.
- Administration HTML is static, but protected data/actions are server-side authenticated and permission checked. Protected pages immediately redirect to login when there is no valid session.
- The existing `frame-ancestors *` policy is retained so the public External View pages can still be embedded in an iframe.

## API Request Log (v3.1)

All outbound Maximo calls made through `lib/maximo.js` are now persisted in PostgreSQL and can be reviewed at `/api-logs.html`.

Captured information includes environment, HTTP method, full request URL, query parameters, request headers/body, response status, response headers/body, duration, success/error state and timestamp. Sensitive values such as `apikey`, authorization tokens, cookies and password/token fields are masked before storage. The masked API key includes only the last four characters and a short SHA-256 fingerprint so environments/keys can be correlated without storing the usable secret in the log.

Access is controlled by the new `apiLogs` role permission. Open **Roles**, edit the required role, enable **API Request Log Page**, and save. Existing roles remain disabled for this new page until explicitly enabled. A newly initialized default administrator role has it enabled.

The `api_request_logs` table and indexes are created automatically by the existing database schema initializer; no manual migration is required.
