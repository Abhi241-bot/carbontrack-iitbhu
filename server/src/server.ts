import app from './app';
import config from './config/env';
import { connectDatabase } from './config/database';
import { seedDatabase } from './seeds/index';
import logger from './utils/logger';
import http from 'http';

const server = http.createServer(app);

async function start(): Promise<void> {
  try {
    await connectDatabase();

    await seedDatabase();

    server.listen(config.port, () => {
      logger.info(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received — shutting down gracefully`);

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      const { default: mongoose } = await import('mongoose');
      await mongoose.connection.close();
      logger.info('MongoDB connection closed');
    } catch (err) {
      logger.error('Error during shutdown:', err);
    }

    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();

export default server;
