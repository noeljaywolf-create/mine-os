# Infra (dev)

- `docker-compose.dev.yml`: local Postgres + Temporal dev server + Temporal UI for Gate A/Core runtime development.
- Start: `docker compose -f infra/docker-compose.dev.yml up -d`
- Temporal: `localhost:7233` (UI `http://localhost:8080`), Postgres: `localhost:5432` (`mineos/mineos`, db `mineos`).
- OPA/NATS can be added when policy distribution or event streaming is wired (outbox-first until needed).
- Production deployment requires OT-specific engineering review, security hardening, HA, backups, and approved network zoning. No industrial writes in Gate A.