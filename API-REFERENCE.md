# Gym Logger API Reference

This document describes the currently implemented backend. Paths are relative to `http://localhost:4000` in local development. There is no `/api` prefix.

## Frontend connection

Use credentials on all requests that participate in the session:

```js
const response = await fetch("http://localhost:4000/users/login", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "test@example.com",
    password: "example-password",
  }),
});
```

The browser stores the HTTP-only `gym.sid` cookie. Do not read it with JavaScript, store tokens, or send a Bearer header. Registration does not log the user in. Call login separately, then use `GET /me` on app load to check authentication. Logout clears the cookie.

The cookie has a rolling 24-hour lifetime, `SameSite=Lax`, and is HTTPS-only in production. Cross-origin fetch requires `credentials: "include"`. Production frontend/backend domains and proxy settings still need to be finalized; the present configuration should not be assumed to support unrelated sites.

For POST, PATCH, PUT, and DELETE requests, the backend requires an `Origin` header exactly matching `FRONTEND_URL`. Browsers supply this header; do not manually set it in fetch. REST Client/curl must supply it, for example `Origin: http://localhost:5173`. Missing or mismatched origins return `403`, even on public routes. GET, HEAD, and OPTIONS bypass this check.

JSON-body endpoints require `Content-Type: application/json` and an object body. Bodyless endpoints should omit the body. A `204` response is empty: do not call `response.json()` on it.

## Response conventions

- Request fields use **camelCase**; returned database records use **snake_case**.
- IDs and foreign-key IDs are **strings**, because PostgreSQL uses `bigint`. Treat them as opaque identifiers.
- PostgreSQL decimal measurements, including `reps`, are returned as **strings**, even though requests require JSON numbers. Convert them for calculations/display as needed.
- Integer measurements and order fields are JSON numbers.
- Missing optional measurements are `null` in returned records.
- Timestamps are ISO strings. Session `performed_on` is a calendar date string (`YYYY-MM-DD`); preserve it as a date rather than converting it to the user's timezone.
- Lists are plain arrays, with no pagination envelope. Empty lists are `[]`.
- Handled errors generally return `{ "message": "..." }`. There are no stable machine-readable error codes.
- Invalid JSON, unknown URLs, and unexpected middleware failures do not currently have a unified JSON error handler. Frontend error handling should tolerate non-JSON responses.
- Record IDs in the URL must convert to positive safe integers; invalid IDs return `404` on detail/update/delete routes.

## Routes at a glance

| Method | Path                            | Login required | Success |
| ------ | ------------------------------- | -------------- | ------- |
| GET    | `/health`                       | No             | `200`   |
| POST   | `/users/register`               | No             | `201`   |
| POST   | `/users/login`                  | No             | `200`   |
| POST   | `/users/logout`                 | No             | `204`   |
| GET    | `/me`                           | Yes            | `200`   |
| PATCH  | `/users/change-password`        | Yes            | `200`   |
| DELETE | `/users/account`                | Yes            | `204`   |
| GET    | `/training-types`               | Yes            | `200`   |
| POST   | `/training-types`               | Yes            | `201`   |
| PATCH  | `/training-types/:id`           | Yes            | `200`   |
| PATCH  | `/training-types/:id/archive`   | Yes            | `200`   |
| PATCH  | `/training-types/:id/unarchive` | Yes            | `200`   |
| DELETE | `/training-types/:id`           | Yes            | `204`   |
| GET    | `/training-sessions`            | Yes            | `200`   |
| POST   | `/training-sessions`            | Yes            | `201`   |
| GET    | `/training-sessions/:id`        | Yes            | `200`   |

The four account routes register/login/change-password/delete-account share one rate limit: **10 requests per IP per 15 minutes**, including successful and validation-failed requests that reach the limiter. Exceeding it returns `429` with `{"message":"Too many attempts. Please try again later."}`. Counters are in memory and reset on restart.

Protected routes return `401` without a valid authenticated session. Ownership-filtered queries return `404` for records belonging to another user as well as missing records. Route-specific errors are listed below; unexpected server failures return `500`.

## Health and accounts

### GET /health

Returns API availability, not a live database health check.

```json
{
  "status": "OK",
  "timestamp": "2026-11-10T10:00:00.000Z",
  "service": "Gym Logger API"
}
```

### POST /users/register

```json
{
  "firstName": "Taylor",
  "email": "taylor@example.com",
  "password": "example-password"
}
```

`firstName` is trimmed and must contain 2–100 characters. Email is trimmed, lowercased, and format-validated. Password must contain 4–255 characters and is not trimmed. The current API calls the input `firstName` but stores/returns it as `full_name`.

Success `201`:

```json
{
  "id": "1",
  "full_name": "Taylor",
  "email": "taylor@example.com",
  "created_at": "2026-11-10T10:00:00.000Z"
}
```

Errors: `400` invalid input; `409` duplicate email. Does not create an authenticated session or replace an existing one.

### POST /users/login

Body: `{"email":"taylor@example.com","password":"example-password"}`.

Email normalization and password length rules match registration. Success `200`: `{"message":"Logged in successfully"}`. Sets a fresh session cookie. No user profile is returned.

Errors: `400` invalid fields; `401` unknown email or incorrect password. Session creation failures return `500`.

### POST /users/logout

No body. Success `204`, destroys the current session and clears the cookie. This endpoint can also be called when already logged out. It does not log out other devices.

### GET /me

Success `200`: `{"userId":"1"}`. Returns only the session's user ID, not a full profile. Missing session returns `401` with `{"message":"You must be logged in"}`.

### PATCH /users/change-password

```json
{
  "currentPassword": "example-password",
  "newPassword": "new-example-password"
}
```

Both passwords must be strings of 4–255 characters. Success `200`: `{"message":"Password changed successfully"}`.

The password update and removal of existing stored sessions happen in one transaction. A fresh session is then created for this browser; other stored sessions are removed. No separate login is normally needed on the current device.

Errors: `400` invalid input; `401` missing session, missing user, or incorrect current password. If the password changed but creating/saving the replacement session failed, the response is `500` with `{"message":"Password changed, but please log in again."}`. Prompt for login with the new password in that case.

### DELETE /users/account

Body: `{"currentPassword":"example-password"}`. The password must be a string of 4–255 characters.

Success `204`. Permanently deletes the user, owned training data, and stored sessions, then destroys the current request's session and clears the cookie. The frontend should clear its cached account/training data and show the logged-out screen.

Errors: `400` invalid input; `401` missing session or incorrect password. If deletion committed but session cleanup failed, returns `500` with `{"message":"Account deleted, but session cleanup failed."}`; the account is already gone.

## Training types

A reusable exercise/activity belongs to one user and uses one category:

| Category          | Example  | Measurements                                     |
| ----------------- | -------- | ------------------------------------------------ |
| `weighted_reps`   | Squat    | Reps and weight                                  |
| `bodyweight_reps` | Pull-ups | Reps, optional added weight                      |
| `cardio`          | Running  | Duration, distance, optional cardio measurements |

Returned training type shape:

```json
{
  "id": "5",
  "user_id": "1",
  "training_name": "Squat",
  "category": "weighted_reps",
  "created_at": "2026-11-10T10:00:00.000Z",
  "archived_at": null
}
```

### GET /training-types

Returns `200` with an array of owned types sorted by `training_name`. **Includes archived types.** For a new-session selector, filter out records whose `archived_at` is not `null`. Keep archived types visible in the library-management screen so they can be restored.

### POST /training-types

Body: `{"trainingName":"Squat","category":"weighted_reps"}`.

Name is trimmed and must contain 1–100 characters. Category must match one of the three strings above. Success `201` with the training type record.

Errors: `400` invalid fields; `409` duplicate name for this user. Different users may use the same name. Name uniqueness is currently case-sensitive.

### PATCH /training-types/:id

Body: `{"trainingName":"Barbell squat"}`. Same name validation as creation. Success `200` with the updated training type.

Only renaming is implemented; sending `category` does not change the category. Historical sessions display the updated name because they reference this type.

Errors: `400` invalid name; `404` missing/inaccessible type or invalid ID; `409` duplicate name.

### PATCH /training-types/:id/archive

No body. Success `200` with the training type and a non-null `archived_at` timestamp. Repeated archive requests preserve the original timestamp. Existing history is retained, and new sessions cannot use this type.

Errors: `404` missing/inaccessible type or invalid ID.

### PATCH /training-types/:id/unarchive

No body. Success `200` with the training type and `archived_at: null`. Repeating the request is allowed.

Errors: `404` missing/inaccessible type or invalid ID.

### DELETE /training-types/:id

No body. Success `204` if the type has no referencing sessions. Both active and archived unused types can be deleted.

Errors: `404` missing/inaccessible type or invalid ID; `409` if sessions reference it, with `{"message":"This training type is used by sessions. Archive it instead."}`.

## Training sessions

A session represents **one exercise/activity**, not an entire gym visit. Use several sessions on the same date for several exercises. `session_order` controls their order on that date.

### Session response shape

```json
{
  "id": "10",
  "user_id": "1",
  "training_type_id": "5",
  "performed_on": "2026-11-10",
  "session_order": 1,
  "notes": "Squat practice",
  "created_at": "2026-11-10T10:00:00.000Z",
  "training_name": "Barbell squat",
  "category": "weighted_reps"
}
```

List and detail responses include `training_name` and `category`. Detail adds `sets`. Creation returns the session and `sets`, but **does not include `training_name` or `category`**; use the selected type or fetch the detail endpoint if needed.

### GET /training-sessions

Returns `200` with an array of owned sessions, newest `performed_on` first, then ascending `session_order` within each date. Does not include sets.

There are no date/category/search filters or pagination yet. The frontend can group this list by `performed_on` for the current history/calendar UI.

### GET /training-sessions/:id

Returns `200` with the session shape above plus `sets`, sorted by `set_order`. Use this for the session detail screen.

Errors: `404` missing/inaccessible session or invalid ID. Archived training types do not prevent viewing old sessions.

Each returned set has this shape:

```json
{
  "id": "20",
  "session_id": "10",
  "set_order": 1,
  "reps": "8.00",
  "weight_kg": "40.000",
  "duration_seconds": null,
  "distance_km": null,
  "avg_heart_rate_bpm": null,
  "avg_power_watts": null,
  "avg_cadence": null,
  "elevation_gain_m": null,
  "created_at": "2026-11-10T10:00:00.000Z"
}
```

### PATCH /training-sessions/:id

Update a session's date, position, or notes without resending its sets.

```json
{
  "performedOn": "2026-11-10",
  "sessionOrder": 2,
  "notes": "Updated notes"
}
```

All three fields are optional, but at least one must be supplied. Omitted fields retain their current values. Send `notes: null` to clear notes; strings are trimmed. Dates must use valid `YYYY-MM-DD` format; order must be a positive integer. Date and order cannot be null.

When moving to another date, the existing order is retained unless a new one is supplied. If the target date/order is occupied, nothing changes and the response is `409`. The endpoint does not shift other sessions or swap their positions automatically.

Success `200`: updated session fields, including `performed_on` as a date string. This response does not include sets, training name, or category; merge these fields into existing frontend state or fetch session details. Sets and the training type remain unchanged. Historical sessions can be edited even when their type is archived.

Errors: `400` invalid input or no supported fields; `404` missing/inaccessible session or invalid ID; `409` occupied date/order. Login, allowed Origin, and a JSON object body are required.

### POST /training-sessions

```json
{
  "trainingTypeId": "5",
  "performedOn": "2026-11-10",
  "sessionOrder": 1,
  "notes": "Squat practice",
  "sets": [
    { "reps": 8, "weightKg": 40 },
    { "reps": 6, "weightKg": 45 }
  ]
}
```

- `trainingTypeId`: ID of an owned, unarchived type. Send its string ID; positive safe-integer numbers are also accepted.
- `performedOn`: valid calendar date in `YYYY-MM-DD` format.
- `sessionOrder`: required positive integer, unique for this user/date. The frontend supplies it; the API does not assign the next position automatically. A conflict returns `409`; refresh the list and choose another position.
- `notes`: optional string or `null`; strings are trimmed.
- `sets`: required nonempty array of objects. Array order becomes `set_order` starting at 1; do not send set IDs or ordering fields.

Success `201`: session fields and all saved sets, using snake_case response fields. The session and sets are saved in one transaction; failure rolls back the inserts.

#### Set request fields

Measurements must be JSON numbers, not numeric strings. Optional fields may be omitted or `null`.

| Field             | Unit / validation                               | Category                                                     |
| ----------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| `reps`            | Number greater than zero; decimal reps accepted | Required for both strength categories                        |
| `weightKg`        | Kilograms, zero or more                         | Required for `weighted_reps`, optional for `bodyweight_reps` |
| `durationSeconds` | Positive integer, seconds                       | Required for cardio                                          |
| `distanceKm`      | Kilometres, zero or more                        | Required for cardio                                          |
| `avgHeartRateBpm` | Integer from 20 to 250                          | Optional for cardio                                          |
| `avgPowerWatts`   | Watts, zero or more                             | Optional for cardio                                          |
| `avgCadence`      | Zero or more; activity-dependent cadence unit   | Optional for cardio                                          |
| `elevationGainM`  | Metres, zero or more                            | Optional for cardio                                          |

Cardio sets reject non-null reps/weight. Strength sets reject non-null cardio measurements. Unrecognized set fields are ignored. PostgreSQL enforces numeric storage ranges and rounds decimals to the column precision; there is no frontend-facing decimal precision validation.

Bodyweight example: `"sets": [{"reps":10}]`.

Cardio example:

```json
{
  "trainingTypeId": "7",
  "performedOn": "2026-11-10",
  "sessionOrder": 2,
  "sets": [
    {
      "durationSeconds": 1800,
      "distanceKm": 5,
      "avgHeartRateBpm": 145,
      "elevationGainM": 20
    }
  ]
}
```

Errors: `400` invalid fields, incompatible/missing measurements, or handled database range/check violations; `404` type missing or owned by another user; `409` archived type or occupied date/order.

Average speed and pace are not returned yet. If displaying them from sets, use consistent units: speed in km/h is `distanceKm * 3600 / durationSeconds`; pace in seconds/km is `durationSeconds / distanceKm` when distance is greater than zero. For multiple segments, sum distances and durations first.

## Not implemented yet

Do not build frontend requests for these until backend support is added:

- Session deletion.
- Individual set creation, editing, deletion, and reordering.
- Changing a training type's category.
- Filtered/paginated history, statistics, dashboard aggregates, and CSV export.
- Full user-profile lookup, email changes, or password recovery.

Manual request examples are in [users.rest](./users.rest) and [trainingSessions.rest](./trainingSessions.rest).
