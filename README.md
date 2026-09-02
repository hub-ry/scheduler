# Scheduler

Find a time to hold a club event when the people you are recruiting are not
already busy.

Two features:

1. **Conflict tracking** - know what competes for your audience's evening.
   Right now that means the registrar's evening exam schedule, which at this
   school lands at 8:00p on weeknights: precisely when student orgs meet.
2. **Event scheduling** - rank candidate time slots by how little of your
   audience is occupied, then add your event at the winner.

## How the ranking works

Every competing thing becomes a weighted busy interval. The weight estimates
how many people in the target audience it occupies - for an exam, that is the
course's enrollment. Candidate slots are laid on a grid across your window and
scored against the intervals they overlap.

Each slot gets two numbers:

| Number            | Question it answers                                  |
| ----------------- | ---------------------------------------------------- |
| `blocked`         | How many people have *something* in the way?          |
| `lost_attendance` | Same, prorated by how much of the slot each conflict eats - modelling people who show up late rather than not at all. |

`lost_attendance` is the ranking key; `blocked` breaks its ties. Both
over-count when one person is busy for two reasons at once, which is fine: we
only ever compare slots against each other and the bias is roughly uniform.

### About the weights

Nobody has entered real enrollment figures yet, so every course currently ranks
with a flat placeholder of 100 rather than an invented roster size. That means:

- **Reliable now:** which slots are clear and which are not.
- **Not reliable yet:** how much worse one conflicted slot is than another.

Enter real numbers on the **Courses** tab (or in `backend/data/target_courses.json`)
and the ranking sharpens. The UI says so wherever a ranking rests on placeholders.

## Data

`backend/data/` holds the Fall 2026 midterm tables copied from the registrar for
MA, STAT, and CS, plus `target_courses.json` - the gateway courses whose students
are the recruiting audience:

MA 161, MA 162, MA 261, MA 265, MA 351, STAT 350, CS 251, CS 307.

It also declares the starter packages - the named audiences described above.

Only exams for those courses are loaded; a 500-level midterm does not compete
for underclassmen and would only add noise.

> **CS 250** is listed as a target but the published Fall 2026 midterm table
> contains no CS 25000 sittings. Either it has no scheduled evening exam or the
> table was filtered. Worth verifying.

## Running it

```bash
./dev
```

Then open <http://localhost:5173>. Ctrl+C stops both servers.

That is the whole thing on a fresh clone too - the script creates the
virtualenv, installs both dependency sets, and seeds the database if any of
those are missing, then starts the API and the web server together with
prefixed logs. Re-running it skips whatever is already done.

Requires `uv` and `npm` (`brew install uv node`). Override the ports with
`API_PORT=8001 WEB_PORT=5174 ./dev`.

To reseed from scratch, delete `backend/scheduler.db` and run `./dev` again.

## Packages

A package is a named audience: the courses whose students you are actually
recruiting. Different events chase different rooms - a CS callout competes with
CS 251 and the calculus sequence, a stats reading group with neither - and
ranking every event against every tracked course averages those audiences
together and mis-ranks both.

Pick one from **Audience** on the Plan tab and only those courses' exams count
against a slot. Build and edit them on the **Courses** tab: the chips across the
top are the packages, clicking one turns the table into a checklist of its
members.

Competing club events are deliberately *not* filtered by the package. A package
says whose calendar we are reasoning about; another org's callout competes for
those people whatever they happen to be enrolled in.

Four ship in `data/target_courses.json` - all target courses, CS club,
underclassmen, stats and data. Seeding only creates a package that does not
exist yet and never rewrites the membership of one that does, because someone
who removes a course from a package means it.

## Pushing to Google Calendar

The **Google Calendar** tab writes the busy landscape out to real calendars.
This is deliberately the only calendar UI ambition the project has: Google
Calendar already has the notifications, the sharing, and a place on everyone's
phone, so this app's job is deciding *what* the events are, not displaying them.

Access is browser-side. Google Identity Services hands the page an access token
after you consent and the page calls the Calendar API directly, so there is no
stored refresh token, no client secret in the repo, and nothing that can write
to a calendar after you close the tab.

### One-time setup

At <https://console.cloud.google.com>:

1. Create a project.
2. **APIs & Services -> Library**: enable the **Google Calendar API**.
3. **OAuth consent screen**: choose *External*, and add your own Google account
   under *Test users*. The calendar scope is one Google classes as sensitive, so
   an unverified project is limited to the test users you list here - fine for a
   handful of officers, and the reason there is no "publish" step below.
4. **Credentials -> Create credentials -> OAuth client ID**, type *Web
   application*, with `http://localhost:5173` as an authorized JavaScript
   origin. Google permits localhost origins, which is why this needs no hosting.
5. Copy `frontend/.env.example` to `frontend/.env` and paste the client id in.
   There is no client secret to copy - the browser flow does not use one.

Restart `./dev` so Vite picks up the new variable.

### What it writes

Three separate calendars, created on first use:

| Calendar | Holds |
| -------- | ----- |
| `Scheduler - Exams` | every sitting for a target course |
| `Scheduler - Competing Events` | club events not marked as yours |
| `Scheduler - Our Events` | events you marked as yours |

Separate rather than combined so a bad sync is undone by deleting one calendar
instead of un-picking hundreds of events, and so each gets its own colour and
visibility toggle. Nothing outside these three is ever touched.

The tab previews before it writes: it shows how many events each calendar would
gain, lose, or have updated, and only then offers **Apply**.

### Why re-running is safe

Every event carries an id derived from the row's identity - for an exam, the
course code and the sitting's start and end - rather than from its database row
id. So the same sitting maps to the same calendar event forever, and a sync is
an upsert rather than an append:

- Re-importing a registrar table **updates** moved sittings in place instead of
  leaving the old ones behind next to the new ones.
- Reseeding the database changes every row id and changes **nothing** in Google.
- A sync that fails halfway leaves a calendar the next run reconciles. Press
  Preview again; nothing is duplicated.
- An event you delete by hand in Google is only trashed, and its id stays taken,
  so the next sync revives it rather than failing forever on a 409.

`frontend/src/gcal.ts` holds that logic as pure functions with no network in
sight, because it is the part that can silently corrupt a real calendar, and
`gcal.test.ts` covers it. The network half is `gcalClient.ts`.

## The Plan tab

Suggesting a time, seeing it in place, and committing it are one screen. The
question that matters - what does the month look like if I take this slot - was
previously something you held in your head while switching tabs.

Hovering a suggestion draws it into the month grid among everything it would
compete with, so comparing two options costs a pointer movement. Hover only
previews; clicking chooses; nothing is written until **Book it**, which saves
the event and pushes it to Google in one action.

The month grid is ours rather than Google's embed iframe. The embed can only
render calendars that have been made public, and it is a sealed frame nothing
can be drawn into - so it could not host the preview overlay, which is the
entire point of the view.

## Snapshots

```bash
./snapshot
```

Freezes the database into `frontend/public/snapshot.json`. Worth running after
importing exam tables or editing enrollments, because `scheduler.db` is
gitignored and regenerated - the enrollment figures typed into the Courses tab
are the only hand-entered data in the project, and the snapshot is where they
survive.

It is also the seam to a static build. The frontend reaches the backend through
exactly one object (`api` in `src/api.ts`) with no stray `fetch` calls, so
pointing that object at this file instead of `/api` is most of what publishing
this as a serverless page would take. The remaining piece is porting the ranker
in `app/core/scheduling.py` to run in the browser. A test asserts the snapshot
stays byte-identical to what the live API serves, so the two cannot drift.

## Running it somewhere other than your laptop

See [DEPLOY.md](DEPLOY.md). Short version: a free Render web service with the
database on free Neon Postgres, one container serving the API and the built
frontend from one origin.

`SCHEDULER_PASSWORD` puts a shared-password gate in front of the whole API.
Without it the app is open to anyone with the URL - signing in with Google
authorises Calendar, not this app - so it is worth setting on anything public.
Leave it unset locally and the gate does not exist.

## Checks

```bash
./check
```

Runs the backend tests, ruff lint and format, the frontend unit tests, typecheck
and build, and eslint. Everything runs even if something fails, so one pass reports all the
problems rather than the first one.

## Adding more exam data

Copy a registrar exam table straight out of the browser and paste it into the
**Import** tab. Keep the title line (`Fall 2026 (PWL) midterm examinations (MA)`)
- it carries the term and year, which the rows themselves do not.

The parser anchors on the date and time columns rather than splitting on
whitespace, because the CRN and Section cells are frequently blank, sometimes
bracketed placeholders, and the Room cell is an unquoted comma-separated list.
It also collapses the registrar's per-CRN duplicate rows and merges `DIST`
sections into their in-person course.

## Layout

```
backend/
  app/core/models.py       Course, CourseMeeting, Exam, ClubEvent, Term, Package
  app/core/scheduling.py   Slot ranking - pure functions, no database
  app/core/registrar.py    Parser for the exam schedule tables
  app/api/                 FastAPI routes and wire schemas
  app/seed.py              Loads data/ into SQLite, idempotently
  app/export.py            Freezes the database into snapshot.json
  data/                    Registrar tables and the target course list
  tests/                   80 tests, run against the real data files
frontend/
  src/api.ts               Typed client - the one place the backend is reached
  src/gcal.ts              Domain rows to Google events; pure, tested
  src/gcalClient.ts        OAuth and the Calendar REST calls
  src/components/          Plan, MonthCalendar, MonthView, WeekCalendar,
                           SlotSearchForm, SlotList, Events, Courses, Import,
                           GoogleSync
```

## Not built yet

- **Scraping the weekly club-events email.** The `ClubEvent.source` field and the
  importer's replace-by-source design are already shaped for it; what is missing
  is the mail ingestion and a parser for that email's format.
- **Weekly class meeting times.** The model supports them (`CourseMeeting`) and
  the ranker expands them, but no meeting-time data has been loaded - only exams.
  This matters less than it sounds, since events are held in the evening.
- **Recurring events**, and multiple terms in one database.
- **Publishing this as a static site.** `./snapshot` produces the data file it
  would need and `api.ts` is already the only seam, but the ranker still has to
  run on a server. Porting `scheduling.py` to TypeScript is what remains, and it
  is only worth doing once someone other than you needs to open the page.
- **Pulling from Google Calendar**, rather than only pushing. Reading an existing
  club calendar in as `ClubEvent` rows would remove most manual entry, and it is
  the same client and the same token.
