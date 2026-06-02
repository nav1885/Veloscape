import Fastify from 'fastify';
import cors from '@fastify/cors';
import stravaAuthRoutes from './routes/stravaAuth';
import cueRoutes from './routes/cues';

async function start() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(stravaAuthRoutes);
  await app.register(cueRoutes);

  app.get('/health', async () => ({ ok: true }));

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';

  await app.listen({ port, host });
  app.log.info(`Veloscape backend listening on ${host}:${port}`);
}

start().catch(err => {
  console.error(err);
  process.exit(1);
});
