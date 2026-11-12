# Gym Logger Backend

Express and TypeScript API for tracking strength training and cardio. Uses PostgreSQL with raw SQL through `pg`.

See [API-REFERENCE.md](./API-REFERENCE.md) for all implemented endpoints, request bodies, response formats, and frontend integration details.

## Current features

- Registration, login, logout, and session lookup.
- Password changes with current-password verification and session replacement.
- Account deletion with session cleanup and cascading training-data deletion.
- Training type creation, listing, renaming, archiving, restoring, and deletion of unused types.
- Session creation with ordered sets in a database transaction.
- Session listing with optional date-range filters and session details with sets.
- Session date, order, and notes editing.
- Session deletion with automatic set deletion.
- Adding, editing, and deleting individual sets in existing sessions.
- User ownership checks, Argon2 hashing, authentication rate limiting, and trusted-origin checks.

Set reordering, category/search filters, pagination, statistics, and CSV export are not implemented yet. The backend is still an MVP in development; deployment-specific cookie and proxy configuration remains to be finalized.

## Stack

- Node.js, TypeScript, Express 5
- PostgreSQL and `pg`
- `express-session` and `connect-pg-simple`
- Argon2 and `validator`
- Helmet, CORS, Morgan, and `express-rate-limit`

## Local setup

Use a supported Node.js LTS version, npm, and a PostgreSQL database. Supabase PostgreSQL can be used through a PostgreSQL connection; this application manages its own users and sessions rather than using Supabase Auth.

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy the environment template:

   ```sh
   cp .env.example .env
   ```

3. Fill in the configuration:

   | Variable                                       | Purpose                                                                                  |
   | ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
   | `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | PostgreSQL connection values                                                             |
   | `DB_PORT`                                      | PostgreSQL port, integer from 1 to 65535                                                 |
   | `SESSION_SECRET`                               | Private random cookie-signing secret; required                                           |
   | `FRONTEND_URL`                                 | Exact allowed frontend origin, such as `http://localhost:5173`, without a trailing slash |
   | `PORT`                                         | API port; defaults to `4000`                                                             |
   | `NODE_ENV`                                     | `development` locally; `production` enables HTTPS-only cookies and combined request logs |

   Generate a session secret with `openssl rand -hex 32`. Store it in `.env`, not in source control.

4. Set up the database using [database.sql](./database.sql) as the reference schema. Editing this file does not apply changes automatically. On a new database, execute it manually; do not rerun its `CREATE TABLE` statements against an existing setup. Existing databases need deliberate migrations. Supabase Data API access, RLS, and privileges are managed separately.

   The session store creates its `session` table when needed. Its database role must have the necessary permissions. Keep this table inaccessible to public Data API clients.

5. Start the backend:

   ```sh
   npm run dev
   ```

   Default API URL: `http://localhost:4000`.

## Commands

| Command             | Purpose                                 |
| ------------------- | --------------------------------------- |
| `npm run dev`       | Run TypeScript with automatic restart   |
| `npm run typecheck` | Check TypeScript without emitting files |
| `npm run build`     | Compile to `dist/`                      |
| `npm start`         | Run the compiled server                 |

## Project structure

- `src/server.ts`: middleware, session configuration, route mounting, and server startup.
- `src/routes/`: HTTP handlers, validation, and responses.
- `src/db/`: parameterized queries and transactions.
- `src/middleware/`: authentication, body shape, origin checks, and rate limiting.
- `src/types/`: Express session type declaration.
- `database.sql`: reference schema, applied manually.

## Data model

Users own reusable training types. Each training session references one type and contains ordered sets. A gym visit with two exercises is represented by two sessions on the same date.

Types are categorized as `weighted_reps`, `bodyweight_reps`, or `cardio`. Archived types remain in history and can be restored. Referenced types cannot be permanently deleted. Sessions are unique by user, date, and position; sets are ordered within their session.

Measurements use kilograms, kilometres, seconds, and metres. Account deletion cascades through the training tables; authentication sessions are deleted explicitly. Creating a session and its sets is atomic.

## Manual testing

Testing currently uses VS Code REST Client requests, not an automated test suite:

- [users.rest](./users.rest): accounts, sessions, and training types.
- [trainingSessions.rest](./trainingSessions.rest): session creation, listing, and details.

Start the backend, register a disposable account, then log in. REST Client retains session cookies. Set the request-file IDs to records owned by that account. Requests that change data need the allowed `Origin` header; browsers supply it automatically.

Check success cases, invalid inputs, logged-out access, duplicate names/positions, archived types, and access using another user's IDs. Account and training-type deletion requests permanently remove data.

## Frontend integration

Use `credentials: "include"` with fetch, including login. The backend sets an HTTP-only `gym.sid` cookie; there is no JWT to save. Use `GET /me` to check the session on app load. Registration requires a separate login request.

Request bodies use camelCase; record responses use snake_case. See the [API reference](./API-REFERENCE.md) before building forms or defining response types.
