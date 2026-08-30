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

Only exams for those courses are loaded; a 500-level midterm does not compete
for underclassmen and would only add noise.

> **CS 250** is listed as a target but the published Fall 2026 midterm table
> contains no CS 25000 sittings. Either it has no scheduled evening exam or the
> table was filtered. Worth verifying.

## Running it

```bash
# Backend - http://127.0.0.1:8000 (docs at /docs)
cd backend
uv venv && uv pip install -e ".[dev]"
.venv/bin/python -m app.seed          # load the checked-in registrar tables
.venv/bin/python -m uvicorn app.main:app --reload

# Frontend - http://localhost:5173, proxies /api to the backend
cd frontend
npm install
npm run dev
```

## Checks

```bash
cd backend  && .venv/bin/python -m pytest && .venv/bin/ruff check .
cd frontend && npm run build && npx eslint src
```

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
  app/core/models.py       Course, CourseMeeting, Exam, ClubEvent, Term
  app/core/scheduling.py   Slot ranking - pure functions, no database
  app/core/registrar.py    Parser for the exam schedule tables
  app/api/                 FastAPI routes and wire schemas
  app/seed.py              Loads data/ into SQLite, idempotently
  data/                    Registrar tables and the target course list
  tests/                   65 tests, run against the real data files
frontend/
  src/api.ts               Typed client
  src/components/          FindTime, WeekCalendar, Events, Courses, Import
```

## Not built yet

- **Scraping the weekly club-events email.** The `ClubEvent.source` field and the
  importer's replace-by-source design are already shaped for it; what is missing
  is the mail ingestion and a parser for that email's format.
- **Weekly class meeting times.** The model supports them (`CourseMeeting`) and
  the ranker expands them, but no meeting-time data has been loaded - only exams.
  This matters less than it sounds, since events are held in the evening.
- **Recurring events**, and multiple terms in one database.
