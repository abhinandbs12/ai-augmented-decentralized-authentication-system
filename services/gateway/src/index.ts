import { createApp } from './app';
import { loadConfig } from './config';

// Matches the gateway port mapping in docker-compose.yml.
const PORT = 3000;

try {
  const app = createApp(loadConfig());
  app.listen(PORT, () => {
    console.log(`Gateway listening on port ${PORT}`);
  });
} catch (error) {
  console.error(`Gateway failed to start: ${(error as Error).message}`);
  process.exit(1);
}
