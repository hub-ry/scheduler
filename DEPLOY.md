# Running it on the server

One Python process behind a Cloudflare Tunnel, on the always-on box. Free, and
`scheduler.ryhub.dev` never changes - which matters more than it sounds, because
Google requires an exact OAuth origin and re-adding it every time a URL moved
was the thing that made every other free option annoying.

Not Docker, not a hosted database, not a container host. This is one process and
a SQLite file on a machine that already has a disk and a service manager.

## Why the tunnel rather than a port

`cloudflared` dials *out* to Cloudflare and Cloudflare routes traffic back down
that connection. So:

- No port forwarding, no inbound firewall rule, nothing exposed on your router.
- TLS is terminated by Cloudflare, so no certificate to obtain or renew.
- The app binds to `127.0.0.1`, so even on the LAN nothing can reach it except
  through the tunnel.

Tailscale stays what it already is for you: how you SSH in to administer it. It
is not in the request path.

## Prerequisite

`ryhub.dev` has to be using Cloudflare's nameservers. If it is not, move it in
the Cloudflare dashboard first - the tunnel cannot create the DNS record
otherwise.

## Setup

SSH in over Tailscale, then:

### 1. User and code

```bash
sudo useradd --system --home /opt/scheduler --shell /usr/sbin/nologin scheduler
sudo git clone https://github.com/hub-ry/scheduler.git /opt/scheduler
sudo chown -R scheduler:scheduler /opt/scheduler
```

Needs Python 3.12+ and Node 20+ on the box; `./serve` creates its own
virtualenv and installs both dependency sets on first run.

### 2. Secrets

```bash
sudo cp /opt/scheduler/deploy/scheduler.env.example /etc/scheduler.env
sudo nano /etc/scheduler.env          # fill in both values
sudo chown root:scheduler /etc/scheduler.env
sudo chmod 640 /etc/scheduler.env
```

`SCHEDULER_PASSWORD` is the shared password. `VITE_GOOGLE_CLIENT_ID` is compiled
into the frontend, and `./serve` rebuilds on every start, so it is picked up
without any extra step.

Keep these out of the repo. The unit file deliberately reads them from
`/etc/scheduler.env` rather than declaring them inline, because unit files are
world-readable and this one is committed.

### 3. Service

```bash
sudo cp /opt/scheduler/deploy/scheduler.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now scheduler
curl localhost:8000/health          # {"status":"ok"}
```

### 4. Tunnel

```bash
cloudflared tunnel login
cloudflared tunnel create scheduler
sudo cp /opt/scheduler/deploy/cloudflared-config.example.yml /etc/cloudflared/config.yml
sudo nano /etc/cloudflared/config.yml    # check the hostname and credentials path
cloudflared tunnel route dns scheduler scheduler.ryhub.dev
sudo cloudflared service install
```

### 5. Google

At <https://console.cloud.google.com/apis/credentials>, open the OAuth client and
add under **Authorized JavaScript origins**:

```
https://scheduler.ryhub.dev
```

Keep the localhost entries so `./dev` still works. This is the last time you
should have to touch this - the hostname is yours and does not change.

## Updating

```bash
cd /opt/scheduler && sudo -u scheduler git pull && sudo systemctl restart scheduler
```

`./serve` rebuilds the frontend on start, so a pull and a restart is the whole
deploy.

## Backups

`scheduler.db` is a single SQLite file, so a copy is a backup:

```bash
sudo -u scheduler sqlite3 /opt/scheduler/backend/scheduler.db ".backup /opt/scheduler/backup.db"
```

`./snapshot` also writes the whole database to
`frontend/public/snapshot.json` - a plain-text record readable without a
database at all, worth committing now and then.

## Local development is unchanged

`./dev` still runs Vite with hot reload against the API, still uses its own
`backend/scheduler.db`, and still has no password unless you set one.
