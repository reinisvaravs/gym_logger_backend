# Gym Logger Backend

Gym Logger is a personal project for tracking strength training and cardio workouts. This repository contains the backend API and PostgreSQL schema.

## Current status

### Implemented

- `GET /health` returns the API status, timestamp, and service name.
- `POST /users/register` validates a user's name, email, and password, hashes the password with Argon2, and stores the account. Duplicate email addresses return `409 Conflict`.
- PostgreSQL schema for users, training types, training sessions, and training sets.

### Planned / incomplete

- Login and session creation are unfinished. `POST /users/login` exists in the code, but a successful login does not yet return a response or create a session.
- Workout-management API endpoints have not been implemented. The workout tables currently exist only in the database schema.

## Technologies

- Node.js and TypeScript
- Express 5
- PostgreSQL, accessed with `pg`
- Argon2 password hashing and `validator` email validation
- `dotenv`, `helmet`, `cors`, `cookie-parser`, and `morgan` for configuration and middleware

## Database

Run [`database.sql`](./database.sql) against the PostgreSQL database configured for the service. It creates:

- `users`: account name, unique normalized email, password hash, and creation time.
- `training_types`: user-owned training names categorized as `weighted_reps`, `bodyweight_reps`, or `cardio`.
- `training_sessions`: a user's training type, date, order for that date, and optional notes.
- `training_sets`: ordered set/measurement records linked to a session, with fields for repetitions, weight, duration, distance, heart rate, power, cadence, and elevation.

Training types and sessions are associated with their owning user; deleting a user cascades to their training types and sessions. Set records cascade when their session is deleted.

## Local setup

Prerequisites: Node.js with npm, and a running PostgreSQL instance.

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create a local environment file and fill in the database connection values:

   ```sh
   cp .env.example .env
   ```

   The required database variables are `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`. `DB_PORT` must be an integer from 1 to 65535.

   Other configuration in `.env.example`:
   - `PORT` (optional; defaults to `4000`)
   - `FRONTEND_URL` (the allowed frontend origin for credentialed CORS)
   - `NODE_ENV` (controls the Morgan log format)
   - `JWT_SECRET` (present in the template but not currently used by the implemented routes)

   Keep real credentials in your local `.env`; do not commit them.

3. Apply the schema to the database matching your `.env` settings. For a local PostgreSQL setup using the template's default database name:

   ```sh
   psql -h localhost -p 5432 -U postgres -d postgres -f database.sql
   ```

   Adjust the connection arguments to match your PostgreSQL setup.

4. Start the development server:

   ```sh
   npm run dev
   ```

   The API listens on `http://localhost:4000` by default. `npm run build` compiles TypeScript to `dist/`; `npm start` runs the compiled server.

## API examples

Health check:

```sh
curl http://localhost:4000/health
```

Register a user:

```sh
curl -X POST http://localhost:4000/users/register \
  -H 'Content-Type: application/json' \
  -d '{"firstName":"Taylor","email":"taylor@example.com","password":"example-password"}'
```

Registration expects `firstName` (2–100 characters), a valid email address, and a password (4–255 characters). A successful response is `201 Created` with the user's `id`, `full_name`, `email`, and `created_at`; the password hash is not returned.
