# Gatehouse

_A lightweight, proxy-agnostic auth gateway that protects your services with a single login. Define which domains need auth, pick your reverse proxy, and you're done._

[Getting Started](#getting-started) • [Docker](#installing-with-docker) • [Features](#features) • [API](#api-reference) • [License](#license)

---

## Getting Started

### Requirements

- Node.js 20+
- Docker & Docker Compose

### Setup

```bash
git clone https://github.com/DeepakSilaych/gatehouse.git
cd gatehouse
npm install
```

### Interactive Setup

```bash
node bin/gatehouse.js init
```

The wizard walks you through:

1. **Proxy selection** — Caddy, Nginx, or Traefik
2. **Auth domain** — Where the login page lives (e.g. `auth.example.com`)
3. **Cookie domain** — Parent domain for cross-subdomain sessions (e.g. `.example.com`)
4. **Sites** — Add each domain with upstream, protection toggle, public paths, and IP whitelist

This generates `gatehouse.json`, `.env`, `docker-compose.yml`, and the proxy config.

### Start

```bash
docker compose up -d
```

### Create your first user

```bash
docker compose exec auth-service node src/cli.js add admin your-password
```

Open `https://auth.example.com/dashboard` to manage everything from the browser.

---

## Installing with Docker

Gatehouse ships with a generated Docker Compose file that runs the auth service and your chosen reverse proxy:

```bash
node bin/gatehouse.js init    # interactive setup
docker compose up -d          # start everything
```

Your existing services just need to join the shared `web` Docker network:

```yaml
services:
  my-dashboard:
    image: my-dashboard:latest
    networks:
      - web

networks:
  web:
    external: true
```

---

## Features

### CLI

- **`gatehouse init`** — Interactive wizard that generates all configs
- **`gatehouse add-site`** — Add or update a protected site
- **`gatehouse generate`** — Regenerate proxy configs from `gatehouse.json`
- **`gatehouse add-user`** / **`remove-user`** / **`list-users`** — Manage users via Docker

### Auth Service

- **Forward auth endpoint** — Works with Caddy `forward_auth`, Nginx `auth_request`, and Traefik `forwardAuth`
- **Rule engine** — Per-domain protection with public path patterns and IP/CIDR whitelist
- **Session tracking** — JWT + SQLite sessions with instant revocation
- **Cross-subdomain cookies** — One login covers all your subdomains

### Dashboard (`auth.example.com/dashboard`)

- **Overview** — Stats cards: users, active sessions, total sites, protected sites
- **Users** — Add, list, delete users from the browser
- **Sites** — Add, edit, delete sites; toggle protection, manage public paths and IP whitelists
- **Sessions** — Live table of active logins with IP, user agent, last seen; instant revoke

### Proxy Generators

- **Caddy** — `forward_auth` with redirect snippet
- **Nginx** — `auth_request` with `error_page` redirect
- **Traefik** — `forwardAuth` middleware with dynamic file config

---

## Architecture

```
gatehouse/
├── bin/
│   └── gatehouse.js              # CLI entry point
├── cli/
│   ├── init.js                   # Setup wizard
│   ├── add-site.js               # Add/update site
│   ├── generate.js               # Config regeneration
│   ├── prompts.js                # Shared interactive prompts
│   └── users.js                  # User management (wraps docker exec)
├── generators/
│   ├── caddy.js                  # Caddy forward_auth config
│   ├── nginx.js                  # Nginx auth_request config
│   ├── traefik.js                # Traefik forwardAuth config
│   └── compose.js                # Docker Compose generator
├── service/                      # Auth service (runs in Docker)
│   ├── Dockerfile
│   ├── public/
│   │   └── dashboard/            # Admin dashboard (HTML/CSS/JS)
│   └── src/
│       ├── index.js              # Express app
│       ├── db.js                 # SQLite — users & sessions
│       ├── auth.js               # JWT, cookies, password hashing
│       ├── rules.js              # Rule engine (domain, path, IP)
│       ├── middleware.js          # Auth middleware
│       ├── cli.js                # In-container user management
│       ├── routes/
│       │   ├── verify.js         # Forward auth endpoint
│       │   ├── login.js          # Login / logout
│       │   ├── users.js          # User CRUD API
│       │   ├── config.js         # Site/rules CRUD API
│       │   └── sessions.js       # Session monitoring API
│       └── pages/
│           └── login.js          # Login page
├── gatehouse.json                # Generated — site definitions
├── docker-compose.yml            # Generated — proxy + auth service
└── .env                          # Generated — secrets
```

**Tech stack:** Node.js, Express, SQLite (better-sqlite3), bcryptjs, jsonwebtoken, Commander, Inquirer.

---

## How It Works

```
User ──► Reverse Proxy ──► /verify ──► Auth Service
              │                            │
              │                  ┌─────────┴─────────┐
              │                  │  Rule Engine       │
              │                  │  ─ Domain match?   │
              │                  │  ─ Path public?    │
              │                  │  ─ IP whitelisted? │
              │                  │  ─ Valid session?   │
              │                  └─────────┬─────────┘
              │                            │
              ▼                    200 ◄───┴───► 401/302
         Upstream Service              Redirect to login
```

1. A user visits `dashboard.example.com`.
2. The reverse proxy sends a subrequest to the auth service's `/verify` endpoint.
3. The rule engine checks if the domain is protected, if the path is public, and if the client IP is whitelisted.
4. If auth is required, the service validates the session cookie (JWT + DB session check).
5. **Authenticated** → `200 OK` with `X-Auth-User` header forwarded to the upstream.
6. **Not authenticated** → Redirect to `auth.example.com/login?redirect=<original-url>`.
7. After login, a cookie is set on `.example.com` (parent domain) so it works across all subdomains.

---

## API Reference

All `/api/*` endpoints require authentication.

| Method | Endpoint               | Description                    |
| ------ | ---------------------- | ------------------------------ |
| GET    | /verify                | Forward auth check             |
| GET    | /login                 | Login page                     |
| POST   | /login                 | Authenticate (form POST)       |
| GET    | /logout                | Clear session and redirect     |
| GET    | /api/users             | List all users                 |
| POST   | /api/users             | Create user `{username, password}` |
| DELETE | /api/users/:username   | Delete user                    |
| GET    | /api/sites             | List all site configs          |
| POST   | /api/sites             | Add site                       |
| PUT    | /api/sites/:domain     | Update site rules              |
| DELETE | /api/sites/:domain     | Remove site                    |
| GET    | /api/sessions          | List active sessions           |
| DELETE | /api/sessions/:id      | Revoke a session               |
| GET    | /api/stats             | Dashboard stats summary        |
| GET    | /health                | Health check (no auth)         |

---

## Environment Variables

### `.env`

| Variable        | Description                                      | Default          |
| --------------- | ------------------------------------------------ | ---------------- |
| `AUTH_DOMAIN`   | Domain where the login page and dashboard live   | —                |
| `COOKIE_DOMAIN` | Parent domain for cross-subdomain cookies        | —                |
| `JWT_SECRET`    | Secret key for signing JWTs                      | —                |
| `SESSION_HOURS` | Session duration in hours                        | `168` (7 days)   |
| `DB_PATH`       | Path to SQLite database file                     | `/data/auth.db`  |
| `NODE_ENV`      | Set to `production` for secure cookies           | —                |

### `gatehouse.json`

```json
{
  "proxy": "caddy",
  "auth_domain": "auth.example.com",
  "cookie_domain": ".example.com",
  "session_hours": 168,
  "sites": [
    {
      "domain": "dashboard.example.com",
      "upstream": "dashboard:3000",
      "protected": true,
      "public_paths": ["/health", "/api/status"],
      "ip_whitelist": ["10.0.0.0/8"]
    },
    {
      "domain": "blog.example.com",
      "upstream": "blog:8080",
      "protected": false
    }
  ]
}
```

---

## Rule Engine

Protection is evaluated per-request in this order:

| # | Check                  | Result if matched           |
| - | ---------------------- | --------------------------- |
| 1 | Domain not in config   | Pass through (no auth)      |
| 2 | `protected: false`     | Pass through (no auth)      |
| 3 | Path matches `public_paths` | Pass through (no auth) |
| 4 | IP matches `ip_whitelist`   | Pass through (no auth) |
| 5 | Valid session cookie   | Allow with `X-Auth-User`    |
| 6 | No valid session       | Redirect to login           |

**Path patterns:** `/health` (exact), `/api/*` (one level), `/docs/**` (recursive).

**IP matching:** Exact (`192.168.1.100`) or CIDR (`10.0.0.0/8`).

---

## License

MIT
