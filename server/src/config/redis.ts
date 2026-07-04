import { Redis } from '@upstash/redis';
import config from './env';
import logger from '../utils/logger';

let redisClient: Redis | null = null;

try {
  const isPlaceholder = (str?: string) => !str || str.includes('placeholder');
  
  if (config.upstashRedisRestUrl && config.upstashRedisRestToken && !isPlaceholder(config.upstashRedisRestUrl) && !isPlaceholder(config.upstashRedisRestToken)) {
    redisClient = new Redis({
      url: config.upstashRedisRestUrl,
      token: config.upstashRedisRestToken,
    });
    logger.info('Redis (Upstash HTTP) client initialised');
  } else {
    logger.warn('Redis env vars missing or using placeholders — caching disabled');
  }
} catch (err) {
  logger.error('Redis initialisation failed — caching disabled:', err);
}

export { redisClient };
