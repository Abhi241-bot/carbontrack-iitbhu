import { Redis } from '@upstash/redis';
import config from './env';
import logger from '../utils/logger';

let redisClient: Redis | null = null;

try {
  if (config.upstashRedisRestUrl && config.upstashRedisRestToken) {
    redisClient = new Redis({
      url: config.upstashRedisRestUrl,
      token: config.upstashRedisRestToken,
    });
    logger.info('Redis (Upstash HTTP) client initialised');
  } else {
    logger.warn('Redis env vars missing — caching disabled');
  }
} catch (err) {
  logger.error('Redis initialisation failed — caching disabled:', err);
}

export { redisClient };
