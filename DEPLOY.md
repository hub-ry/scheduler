# Running it on Replit

For showing the board to other officers in a meeting: the repl runs, it has a
URL, everyone can open it. Close it and it stops.

Free, and it needs no database service. Unlike free container hosts, the Replit
workspace has a real disk, so `scheduler.db` sits in the repl and survives
between runs - which is why this is a `./serve` script and not a Dockerfile with
a hosted Postgres behind it.

## Setup

1. **Import the repo.** Replit → Create → Import from GitHub → this repository.
   It reads `.replit`, which already sets the database path, seeding, and the
   port.

2. **Set the password.** In the **Secrets** pane (the padlock), add:

   ```
   SCHEDULER_PASSWORD = whatever the exec board shares
   ```

   Not in a file. The repl is public, so a password in the repo is not a
   password. `./serve` warns on start if this is unset, because the workspace
   URL is reachable by anyone who has it.

3. **Set the Google client id.** Also in Secrets:

   ```
   VITE_GOOGLE_CLIENT_ID = <your id>.apps.googleusercontent.com
   ```

   Vite reads this at build time, and `./serve` builds on every start, so it is
   picked up without anything extra.

4. **Press Run**, then copy the URL from the webview.

5. **Add that URL to Google.** At
   <https://console.cloud.google.com/apis/credentials>, open the OAuth client and
   add it under **Authorized JavaScript origins**, keeping the localhost entries
   so `./dev` still works.

## The URL changes

This is the one real annoyance. Replit's workspace URLs are not guaranteed
stable between sessions, and Google requires an exact origin - so when the URL
changes, Calendar sync fails with `no registered origin` until you add the new
one in step 5.

Everything else in the app keeps working; it is only the Calendar push that
needs the origin. A stable domain means Replit's Deployments, which are paid.

## Local development is unchanged

`./dev` still runs Vite with hot reload against the API, still uses
`backend/scheduler.db`, and still has no password unless you set one. `./serve`
is the production-shaped path: build once, one process, no hot reload.

## Backups

The repl's disk is not a backup. `./snapshot` writes the whole database to
`frontend/public/snapshot.json`, which is worth committing now and then - a
plain-text record you can read without a database at all, and the file a static
build would ship if this ever becomes one.
