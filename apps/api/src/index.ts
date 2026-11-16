import Fastify from 'fastify';
// Gate A skeleton: authenticated API boundary, investigations/commands, idempotency & policy gateway hooks to be wired.

const app = Fastify({ logger: true });

app.get('/health', async () => ({ status: 'ok', service: 'mine-os-api', gate: 'A-skeleton' }));

// Placeholder routes (to be implemented with Postgres persistence, Temporal client, OPA/policy checks)
app.get('/investigations', async () => ({ investigations: [] }));
app.post('/investigations', async (req) => ({ accepted: true, note: 'Investigation creation to be wired to Core runtime (Temporal)', input: req.body }));

const port = Number(process.env.PORT || 8787);
app.listen({ port, host: '0.0.0.0' }).catch((err) => { app.log.error(err); process.exit(1); });
