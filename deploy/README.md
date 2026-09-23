# Production deployment

This target runs the Next.js app, PostgreSQL, and Caddy. Caddy terminates HTTPS and obtains/renews the certificate for `APP_DOMAIN` automatically once DNS points at the host and ports 80/443 are reachable.

1. Copy `.env.example` to `.env.production` and set `NODE_ENV=production`, an HTTPS `APP_URL`, a long random `SESSION_SECRET`, a dedicated database role such as `cocoa_app`, and the SMTP settings used for password recovery. Keep this file out of source control.
2. Set `APP_DOMAIN` in the shell or a compose environment file, then run `docker compose --env-file .env.production -f deploy/docker-compose.yml up -d --build`.
3. Apply migrations and create the first admin: `docker compose --env-file .env.production -f deploy/docker-compose.yml run --rm app npm run init-db`.
4. Confirm `https://APP_DOMAIN/api/health` returns `status: ok`. Schedule `npm run prune-sessions` daily and `scripts/backup-db.ps1` daily (or use your managed PostgreSQL provider's encrypted backup/PITR service).

For a managed PostgreSQL service, omit the `db` service and set `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_SSL=true` in `.env.production`. Use a least-privilege role dedicated to this application and restrict its network access to the app host.
