# scheduler

![Scheduler 3-Month Calendar View](docs/screenshot.png)

A scheduling calendar built to pick conflict-free club event dates around major Purdue CS exam schedules and academic breaks.

Picking dates for hack nights, callouts, and tech talks usually means juggling five course syllabi, registrar PDF tables, and other club announcements in separate tabs. Scheduler pulls exam schedules directly from UniTime for target courses, layers campus closures and breaks, and evaluates every potential slot against real student audience conflicts.

### The Loop

1. **Track courses & exams**: Pull exam dates from UniTime or registrar tables for underclassmen and sophomore CS courses (CS 180, CS 251, MA 161, MA 162, MA 261, STAT 350, CS 307).
2. **Layer campus constraints**: Ingest the university academic calendar (`backend/data/academic_calendar.json`) for instructional breaks, campus closures, and finals weeks.
3. **Recommend days**: Turn on the host window toggle to spot clear weekday evenings (7:00 PM and beyond) across 1, 3, or 6 month horizons.
4. **Rank & schedule**: Score open slots against student attendance overlap, or add competing club events to keep everyone off conflicting nights.
5. **Sync to Google Calendar**: Push scheduled club events and academic milestone layers to Google Calendar via OAuth.

### Core Features

- **Multi-Month Views**: Switch seamlessly between 1-month, 3-month, and 6-month calendar horizons.
- **Recommend Days**: One-click switch that scans the entire semester and highlights conflict-free weekday evenings.
- **Audience Weight Scoring**: Slots are penalized based on course enrollment fractions so major midterm days never look viable.
- **Themes**: Default Notion dark (`#181818`) and Coffee (Spill roasted espresso `#1c1513`).
- **Inline Event Popover & Quick Add**: Click any slot to add events with duration presets and live time range previews, or click existing events to reschedule, edit, or delete.

### Quickstart

Run tests, typechecks, and linters:
```bash
./check
```

Start local development (Vite frontend with hot reload + FastAPI backend):
```bash
./dev
```

Build the frontend bundle and serve everything from one process:
```bash
./serve
```

Set `SCHEDULER_PASSWORD` in your environment to enable password access control.

### Architecture

```
scheduler/
├── backend/
│   ├── app/                 # FastAPI routes, UniTime client, ranker
│   └── data/
│       └── academic_calendar.json  # Campus breaks, closures, finals
├── frontend/
│   ├── src/
│   │   ├── components/      # MonthCalendar, QuickAddEvent, GoogleSync
│   │   ├── dates.ts         # Local timezone date math
│   │   └── styles.css       # Design tokens and theme system
└── docs/
    └── screenshot.png       # 3-month calendar view
```

### Production

Runs on Linux (`slim` / `hub`) fronted by a Cloudflare Tunnel at [scheduler.ryhub.dev](https://scheduler.ryhub.dev).
