# Deploying

Free, and it stays free: a Render web service on the free plan, with the
database on Neon's free Postgres. One process serves the API and the built
frontend, so there is one URL and no CORS.

## Why not SQLite

Locally the database is `backend/scheduler.db` and that is fine. Render's free
plan has no persistent disk, so a SQLite file lives only until the next restart
or deploy - and free services restart often. Everything you had typed would
vanish without warning, which is worse than not deploying at all.

Neon's free tier is a real Postgres that keeps your data. `app/db.py` picks
between them from `SCHEDULER_DATABASE_URL`, so nothing about local development
changes.

## What free actually means here

- **The service sleeps after 15 minutes idle**, and the next visit takes 30-60
  seconds to wake up. For a tool opened a few times a week that is a shrug; if
  it starts to annoy, Render's cheapest paid tier removes it.
- **Neon's free branch sleeps too**, and wakes in a second or two.
- Neither has a trial that expires.

## One-time setup

### 1. Database

At <https://neon.tech>: sign up, create a project, copy the connection string
from the dashboard. It looks like
`postgresql://user:pass@ep-something.aws.neon.tech/neondb?sslmode=require`.

### 2. Service

At <https://render.com>: **New → Blueprint**, point it at this repository. It
reads `render.yaml` and creates the service. Then set the two secrets it asks
for:

| Variable | Value |
| -------- | ----- |
| `SCHEDULER_DATABASE_URL` | the Neon string from step 1 |
| `SCHEDULER_PASSWORD` | whatever the exec board will share |

`SCHEDULER_SEED_ON_START` is already set, so the first boot loads the courses,
packages and exam tables into the empty database. It is idempotent and safe to
leave on.

### 3. Google OAuth

The client id is compiled into the frontend bundle, so it is a build argument
rather than a runtime variable. In Render's settings, add a Docker build
argument:

```
VITE_GOOGLE_CLIENT_ID = <your id>.apps.googleusercontent.com
```

Then add the deployed origin to the OAuth client at
<https://console.cloud.google.com/apis/credentials> under **Authorized
JavaScript origins**, alongside the localhost ones:

```
https://scheduler.onrender.com
```

Use whatever hostname Render gave you. Keep the localhost entries so `./dev`
keeps working.

## The password gate

`SCHEDULER_PASSWORD` gates the whole API. Without it the app is completely open
to anyone with the URL - signing in with Google authorises *Calendar*, not this
app, so it is not protecting anything here.

Leave the variable unset and the gate disappears entirely, which is the right
default locally: `./dev` never asks for a password.

Changing the password signs everyone out, because sessions are signed with a key
derived from it. That is deliberate - removing someone's access should take
effect immediately.

## Backups

The Neon dashboard has point-in-time restore on the free tier. Beyond that,
`./snapshot` writes the whole database to `frontend/public/snapshot.json`, which
is worth committing occasionally as a plain-text record you can read without a
database at all.

## Custom domain

Render's dashboard takes a custom domain and issues the certificate. If you
point `scheduler.ryhub.dev` at it, add that origin to the Google OAuth client
too, or the Calendar sync will fail with `no registered origin`.
