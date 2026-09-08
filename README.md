# Gatehouse

One login for every service behind your reverse proxy. Gatehouse serves the login page, keeps sessions, and answers your proxy's forward-auth check, so a request to any protected subdomain without a session is sent to sign in.

[Quickstart](#quickstart) • [How it works](#how-it-works) • [Proxy configs](#proxy-configs) • [Configuration](#configuration) • [API](#http-api) • [Development](#development)

## Why

- Self-hosted apps often ship with no login, or one login each. A cookie on the parent domain (`.example.com`) lets one sign-in cover `app.example.com`, `grafana.example.com`, and the rest.
- Most auth gateways are tied to one proxy. Gatehouse generates the config for Caddy (`forward_auth`), Nginx (`auth_request`) or Traefik (`forwardAuth`) from one `gatehouse.json`, and the same `/verify` endpoint serves all three.
- Sessions are rows in SQLite, not just claims in a JWT. Revoking one in the dashboard takes effect on the next request.
- No identity provider, no Redis, no database server. One Node container plus the proxy you already run.

## Demo

<!-- TODO: screenshot of the login page (service/src/pages/login.js) -->
<!-- TODO: screenshot of the dashboard Sessions tab (service/public/dashboard) -->

## Quickstart

Requirements: Node.js 20 or newer on the host (the service image is `node:20-alpine`), Docker with the Compose plugin, and DNS for `auth.example.com` plus each site domain pointing at the box. Run every `gatehouse` command from the directory that holds `gatehouse.json`; paths are resolved from the current directory.

1. Install the CLI

```bash
git clone https://github.com/DeepakSilaych/Gatehouse.git
cd Gatehouse
npm install
```

2. Run the wizard

```bash
node bin/gatehouse.js init
```

It asks for the proxy (Caddy, Nginx or Traefik), the auth domain, the cookie domain (defaults to the auth domain's parent, e.g. `.example.com`), the session length in hours, and one or more sites (domain, upstream `service:port`, protected or not, public paths, IP whitelist). It writes `gatehouse.json`, `.env` (with a random 32-byte `JWT_SECRET`), `docker-compose.yml`, and the proxy config under `caddy/`, `nginx/` or `traefik/`.

3. Start the proxy and the auth service

```bash
docker compose up -d
```

4. Create the first user

```bash
node bin/gatehouse.js add-user admin 'a-long-password'
# same thing without the wrapper:
docker compose exec auth-service node src/cli.js add admin 'a-long-password'
```

5. Verify (use `http://` instead of `https://` for Nginx and Traefik, see Limitations)

```bash
curl -s https://auth.example.com/health                                    # OK
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://app.example.com/   # 302 .../login?redirect=...
```

Then open `https://auth.example.com/dashboard`, sign in, and manage users, sites and sessions from the browser.

Optional: `npm link` puts `gatehouse` on your PATH, so `node bin/gatehouse.js init` becomes `gatehouse init`. To skip the wizard, write `gatehouse.json` and `.env` by hand (see Configuration) and run `node bin/gatehouse.js generate`; this is what the test suite does.

Your own services join the generated `web` network and are addressed by container name (`app:3000`):

```yaml
services:
  app:
    image: my-app:latest
    networks: [web]

networks:
  web:
    external: true
```

## How it works

```
 Browser                 Proxy (Caddy / Nginx / Traefik)      auth-service :3000       SQLite
   |                         |                                    |                        |
   | GET https://app.example.com/reports                          |                        |
   |------------------------>|                                    |                        |
   |                         | GET /verify                        |                        |
   |                         |   X-Forwarded-Host: app.example.com|                        |
   |                         |   X-Forwarded-Uri:  /reports       |                        |
   |                         |   X-Forwarded-For / X-Real-IP      |                        |
   |                         |   Cookie: __gatehouse_token=<jwt>  |                        |
   |                         |----------------------------------->|                        |
   |                         |                                    | rules.evaluate(host, uri, ip)
   |                         |                                    |   unknown site, protected:
   |                         |                                    |   false, public path or|
   |                         |                                    |   whitelisted IP -> 200|
   |                         |                                    | verifyToken(jwt)       |
   |                         |                                    | findSession(sid) ----->|
   |                         |                                    |<--- row or null -------|
   |                         |                                    | touchSession(sid) ---->|
   |  [session valid]        |<-- 200  X-Auth-User: alice --------|                        |
   |                         |---> upstream app:3000 with X-Auth-User                      |
   |<--- upstream response --|                                    |                        |
   |  [no or bad session]    |                                    |                        |
   |                         |<-- Caddy, Traefik (uri has ?rd=auth.example.com):           |
   |                         |    302 https://auth.example.com/login?redirect=<orig url>   |
   |                         |<-- Nginx: 401 + X-Auth-Redirect header;                     |
   |                         |    error_page 401 = @login_redirect builds the same 302     |
   |<--- 302 to login -------|                                    |                        |
   | GET https://auth.example.com/login?redirect=<orig url>       |                        |
   |------------------------>|----------------------------------->| renderLoginPage()      |
   | POST /login  username, password, redirect                    |                        |
   |------------------------>|----------------------------------->| bcrypt.compare()       |
   |                         |                                    | createToken -> jwt{sid}|
   |                         |                                    | createSession(sid, ip, |
   |                         |                                    |   ua, expires_at)      |
   |                         |                                    |----------------------->|
   |<--- 302 <orig url> -----|<-----------------------------------|                        |
   | Set-Cookie: __gatehouse_token=<jwt>; Domain=.example.com; Path=/; HttpOnly;
   | SameSite=Lax; Max-Age=SESSION_HOURS; Secure when NODE_ENV=production
   | GET https://app.example.com/reports   (cookie is sent to every *.example.com)         |
   |------------------------>| /verify -> 200 -> upstream         |                        |
```

1. The proxy sends every request for a protected domain to `GET /verify` on the auth service, with the original host, path and client IP in `X-Forwarded-*` headers. Caddy and Traefik add those headers themselves; the Nginx config sets them explicitly (`generators/nginx.js`).
2. `evaluate()` in `service/src/rules.js` decides whether auth is needed at all. Unknown domain, `protected: false`, a matching `public_paths` pattern, or a whitelisted IP all return 200 without reading the cookie.
3. Otherwise `service/src/routes/verify.js` reads the `__gatehouse_token` cookie, verifies the JWT signature and expiry (`service/src/auth.js`), and looks up the `sid` claim in the `sessions` table (`service/src/db.js`). No row means the session was revoked or the user deleted. A hit updates `last_seen`.
4. On success the proxy copies `X-Auth-User` onto the upstream request, so the app knows who is logged in.
5. On failure the redirect target is built from the forwarded proto, host and URI. Caddy and Traefik hand a non-2xx auth response straight back to the browser, so `/verify?rd=<auth domain>` answers with the 302 itself. Nginx `auth_request` only understands 2xx, 401 and 403, so `/verify` without `rd` answers 401 plus an `X-Auth-Redirect` header, and the generated `error_page 401 = @login_redirect` turns that into the redirect.
6. `POST /login` (`service/src/routes/login.js`) checks the bcrypt hash, signs a JWT `{id, username, sid}` with `JWT_SECRET`, inserts the session row (IP, user agent, expiry), and sets the cookie with `Domain=COOKIE_DOMAIN`. The browser then sends that cookie to every subdomain, so the next `/verify` on any site passes.
7. `GET /logout` deletes the session row and clears the cookie. The dashboard's Revoke button does the same for someone else, and deleting a user cascades to their sessions.

## Proxy configs

All three are emitted by `node bin/gatehouse.js generate` from `gatehouse.json`. The snippets below are the exact output for `auth_domain: auth.example.com` and one protected site `app.example.com` with upstream `app:3000`. `auth-service:3000` is the Compose service name; it is reachable only on the `web` network, never on a host port.

**Caddy** (`caddy/Caddyfile`, from `generators/caddy.js`). Caddy fetches certificates on its own. Set `"tls": false` in `gatehouse.json` to prefix each site with `http://` and stay on plain HTTP.

```
(protect) {
	forward_auth auth-service:3000 {
		uri /verify?rd=auth.example.com
		copy_headers X-Auth-User
	}
}

auth.example.com {
	reverse_proxy auth-service:3000
}

app.example.com {
	import protect
	reverse_proxy app:3000
}
```

**Nginx** (`nginx/nginx.conf`, from `generators/nginx.js`). The auth domain gets a plain `proxy_pass http://auth-service:3000;` server block. Each protected site gets:

```nginx
server {
    listen 80;
    server_name app.example.com;

    location = /_auth {
        internal;
        proxy_pass http://auth-service:3000/verify;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Uri $request_uri;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Cookie $http_cookie;
    }

    location @login_redirect {
        return 302 $scheme://auth.example.com/login?redirect=$scheme://$host$request_uri;
    }

    location / {
        auth_request /_auth;
        auth_request_set $auth_user $upstream_http_x_auth_user;
        proxy_set_header X-Auth-User $auth_user;
        error_page 401 = @login_redirect;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_pass http://app:3000;
    }
}
```

**Traefik** (`traefik/dynamic.yml`, from `generators/traefik.js`). A static `traefik/traefik.yml` is generated too: entry points `web` (`:80`) and `websecure` (`:443`), the file provider pointing at `dynamic.yml`, Traefik dashboard off. Routers are attached to `web` only. Below the routers the file also defines one `loadBalancer` service per router (`auth-svc` to `http://auth-service:3000`, `app-svc` to `http://app:3000`), omitted here.

```yaml
http:
  middlewares:
    gatehouse-auth:
      forwardAuth:
        address: "http://auth-service:3000/verify?rd=auth.example.com"
        authResponseHeaders:
          - "X-Auth-User"
        trustForwardHeader: true

  routers:
    auth:
      rule: "Host(`auth.example.com`)"
      service: auth-svc
      entryPoints:
        - web
    app:
      rule: "Host(`app.example.com`)"
      service: app-svc
      middlewares:
        - gatehouse-auth
      entryPoints:
        - web
```

**Any other proxy**: call `GET http://auth-service:3000/verify` with `X-Forwarded-Host`, `X-Forwarded-Uri`, `X-Forwarded-Proto`, the client IP (`X-Real-IP` or `X-Forwarded-For`) and the original `Cookie` header, then copy `X-Auth-User` from the response. Add `?rd=<auth domain>` if your proxy relays the 302 to the client; leave it off and act on the 401 yourself if it does not.

## Features

| Area | What it does | Where |
|---|---|---|
| Forward auth | One `GET /verify` for Caddy `forward_auth`, Nginx `auth_request`, Traefik `forwardAuth` | `service/src/routes/verify.js` |
| Rule engine | Per-domain protect flag, public path patterns, IPv4 / CIDR whitelist | `service/src/rules.js` |
| Sessions | JWT carries a session id; the SQLite row is checked on every request, so revoke is instant | `service/src/auth.js`, `service/src/db.js` |
| Cross-subdomain cookie | `__gatehouse_token` with `Domain=COOKIE_DOMAIN`, `HttpOnly`, `SameSite=Lax`, `Secure` in production | `service/src/auth.js` |
| Login page | Server-rendered form that returns the user to the original URL | `service/src/pages/login.js` |
| Dashboard | Stats; users (add, delete); sites (add, edit, delete, protect toggle, public paths, IP whitelist); sessions (IP, user agent, last seen, revoke) | `service/public/dashboard/` |
| Generators | Caddyfile, `nginx.conf`, Traefik dynamic and static YAML, `docker-compose.yml` | `generators/` |
| Host CLI | `init` (wizard); `add-site` (prompts for one site, adds or replaces it, regenerates, then `docker compose restart`); `generate`; `add-user <u> <p>`, `remove-user <u>`, `list-users` (wrap `docker compose exec auth-service node src/cli.js ...`) | `bin/gatehouse.js`, `cli/` |
| Container CLI | `node src/cli.js add`, `list`, `remove` | `service/src/cli.js` |

### HTTP API

Everything under `/api` and `/dashboard` needs a valid session cookie. Without one, `/api` calls that send `Accept: application/json` get `401 {"error":"Unauthorized"}`; anything else gets a 302 to `/login`.

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | No auth. Body `OK` |
| GET | `/verify` | Forward-auth check. `?rd=<host>` makes it answer 302 instead of 401 |
| GET | `/login` | Login page. `?redirect=` is where to go afterwards |
| POST | `/login` | Form fields `username`, `password`, `redirect` |
| GET | `/logout` | Deletes the session row, clears the cookie, redirects to `/login` |
| GET | `/api/users` | `[{id, username, created_at}]` |
| POST | `/api/users` | `{username, password}`. 409 if the name exists |
| DELETE | `/api/users/:username` | Also deletes that user's sessions (foreign key cascade) |
| GET | `/api/sites` | The `sites` array from `gatehouse.json` |
| POST | `/api/sites` | `{domain, upstream, protected?, public_paths?, ip_whitelist?}`. `protected` defaults to true |
| PUT | `/api/sites/:domain` | Updates `upstream`, `protected`, `public_paths`, `ip_whitelist` |
| DELETE | `/api/sites/:domain` | Removes the site |
| GET | `/api/sessions` | Purges expired rows, returns the rest ordered by `last_seen` |
| DELETE | `/api/sessions/:id` | Revoke. Currently reachable at `/api/api/sessions/:id`, see Limitations |
| GET | `/api/stats` | `{users, sessions, sites, protected_sites}` |

## Configuration

### `.env` (read by the service)

| Variable | Default in code | Purpose |
|---|---|---|
| `JWT_SECRET` | `change-me` | HMAC key for the JWT. `init` writes 32 random bytes as hex. Changing it invalidates every session |
| `COOKIE_DOMAIN` | empty (host-only cookie) | `Domain` attribute on the cookie, e.g. `.example.com` |
| `SESSION_HOURS` | `168` | JWT lifetime, cookie `Max-Age`, and `sessions.expires_at` |
| `AUTH_DOMAIN` | none | Used to build `X-Auth-Redirect` on the 401 path (Nginx) |
| `NODE_ENV` | none | `production` sets the `Secure` cookie flag. `init` writes `production` |
| `DB_PATH` | `/data/auth.db` | SQLite file. Compose mounts the `auth_data` volume at `/data` |
| `CONFIG_PATH` | `/app/gatehouse.json` | Site rules. Compose bind-mounts `./gatehouse.json` there |
| `PORT` | `3000` | Listen port inside the container |

### `gatehouse.json` (read by the generators and the service)

```json
{
  "proxy": "caddy",
  "tls": true,
  "auth_domain": "auth.example.com",
  "cookie_domain": ".example.com",
  "session_hours": 168,
  "sites": [
    {
      "domain": "app.example.com",
      "upstream": "app:3000",
      "protected": true,
      "public_paths": ["/health", "/api/public/**"],
      "ip_whitelist": ["10.0.0.0/8", "192.168.1.100"]
    },
    { "domain": "blog.example.com", "upstream": "blog:8080", "protected": false }
  ]
}
```

| Key | Read by | Notes |
|---|---|---|
| `proxy` | `cli/generate.js` | `caddy`, `nginx` or `traefik` |
| `tls` | `generators/caddy.js` only | `false` turns off Caddy's automatic HTTPS |
| `auth_domain` | all generators | Where the login page and dashboard are served |
| `cookie_domain`, `session_hours` | nothing at runtime | Written by `init` for reference. The live values are `COOKIE_DOMAIN` and `SESSION_HOURS` in `.env` |
| `sites[].domain` | generators, `rules.js` | Matched against `X-Forwarded-Host` |
| `sites[].upstream` | generators | `container:port` on the `web` network |
| `sites[].protected` | generators, `rules.js` | `false` means proxy only, no auth |
| `sites[].public_paths` | `rules.js` | Patterns that skip auth |
| `sites[].ip_whitelist` | `rules.js` | IPv4 addresses or CIDRs that skip auth |

The dashboard writes site changes back to this file (`persist()` in `rules.js`) and they apply to `/verify` at once. The proxy config does not follow: run `node bin/gatehouse.js generate` and `docker compose restart` after adding a domain. The service reads the file once at startup, so edits made outside the dashboard need `docker compose restart auth-service`.

### Rule order

`evaluate()` in `service/src/rules.js`, first match wins:

| # | Check | Result |
|---|---|---|
| 1 | Domain not in `sites` | 200, no auth |
| 2 | `protected: false` | 200, no auth |
| 3 | Path matches a `public_paths` pattern | 200, no auth |
| 4 | Client IP matches `ip_whitelist` | 200, no auth |
| 5 | Valid JWT and the session row exists | 200 with `X-Auth-User` |
| 6 | Otherwise | 302 to login (Caddy, Traefik) or 401 (Nginx) |

Path patterns: `/health` exact; `/api/*` one segment under `/api/`; `/docs/**` anything under `/docs/`. Client IP is `X-Real-IP`, else the first `X-Forwarded-For` entry, else the socket address. Only IPv4 is parsed.

## Design decisions

- JWT plus a session row, not JWT alone. `/verify` does one SQLite read (`findSession`) and one write (`touchSession`) per proxied request. That buys instant revoke and a live sessions table. better-sqlite3 is synchronous and the database runs in WAL mode, so on one box this is cheap.
- 401 versus 302 is decided per proxy on purpose. Caddy and Traefik relay a non-2xx auth response to the client, so the service answers 302 directly when `?rd=` is present. Nginx `auth_request` treats anything other than 2xx, 401 or 403 as an error, so it gets 401 plus `X-Auth-Redirect` and builds the redirect in `@login_redirect`.
- The auth service has no published port. It listens only on the `web` network and trusts `X-Forwarded-*` headers from the proxy (there is no Express `trust proxy` setting). Do not publish port 3000.
- Site config is a JSON file bind-mounted into the container, not a table. The same file feeds the generators and the dashboard, and it survives `docker compose down -v`. Users and sessions live in the `auth_data` volume and do not.
- `COOKIE_DOMAIN` must be the parent of the auth domain and every site. `SameSite=Lax` is what lets the top-level redirect after login carry the cookie to the other subdomain.
- Passwords use bcryptjs (pure JS, cost 12), so the only native module is better-sqlite3; the Dockerfile installs `python3 make g++` for that build.

## Project layout

```
bin/gatehouse.js           CLI entry (commander)
cli/                       init wizard, add-site, generate, user commands (docker compose exec wrappers)
generators/                caddy.js, nginx.js, traefik.js, compose.js
service/                   the auth service container
  Dockerfile               node:20-alpine, npm install --production, EXPOSE 3000
  src/index.js             Express app: /health, /verify, /login, /logout, /api/*, /dashboard
  src/auth.js, db.js       bcrypt + JWT + cookie helpers; better-sqlite3 users and sessions tables
  src/rules.js             gatehouse.json loader, evaluate(), site CRUD and persist
  src/middleware.js        requireAuth for /api and /dashboard
  src/routes/, pages/      verify, login, users, config (sites and stats), sessions; login page HTML
  src/cli.js               in-container add / list / remove users
  public/dashboard/        static admin UI (vanilla JS, no build step)
test/run.sh                integration tests against the real proxies (docker compose + curl)
test/docker-compose.test.yml   two throwaway upstreams the tests proxy to
gatehouse.json, .env, docker-compose.yml, caddy/, nginx/, traefik/   generated and git-ignored
```

## Development

The integration tests bring up the real stack for each proxy, create a user, and drive it with curl: health, public site, redirect when logged out, login, `X-Auth-User` reaching the upstream, public path, dashboard and API, logout.

```bash
./test/run.sh            # caddy, nginx, traefik in turn
./test/run.sh nginx      # one proxy
```

Needs Docker, curl and Node on the host. The script writes its own `gatehouse.json` and `.env` in the repo root and deletes them at the end, so run it in a clean checkout, not next to a live config.

Run the service on the host without Docker:

```bash
cd service && npm install
DB_PATH=./auth.db CONFIG_PATH=../gatehouse.json JWT_SECRET=dev npm start   # http://localhost:3000
node src/cli.js add admin secret
```

There is no linter, no unit test suite, and no CI workflow in the repo yet.

## Limitations

- Session revoke is registered as `DELETE /api/sessions/:id` on a router that is already mounted at `/api` (`service/src/routes/sessions.js:11`, `service/src/index.js:26`), so it answers at `/api/api/sessions/:id`. The dashboard calls `/api/sessions/:id` and gets a 404. The fix is to drop the `/api` prefix in that route.
- Only Caddy gets HTTPS. The generated Nginx config listens on 80 only and the Traefik routers use the `web` entry point only, although both Compose services publish 443. `init` writes `NODE_ENV=production`, which marks the cookie `Secure`, and browsers do not store a `Secure` cookie over plain HTTP. Terminate TLS in front, or set `NODE_ENV` to something else (the tests use `development`).
- `redirect` on `/login` is neither validated nor HTML-escaped (`service/src/routes/login.js`, `service/src/pages/login.js`). It is an open redirect.
- No rate limiting on `POST /login`.
- The IP whitelist parses IPv4 only (`ipToNum` splits on `.`).
- Traefik router and service names are the first label of the domain, so `app.example.com` and `app.other.com` collide (`generators/traefik.js`).

## Contributing

Open an issue or a pull request on GitHub. Run `./test/run.sh <proxy>` for the proxy you touched before sending it.

## License

No license file yet. The previous README stated MIT; adding a `LICENSE` file would make that binding.
