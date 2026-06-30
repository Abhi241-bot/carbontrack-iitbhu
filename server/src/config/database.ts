import mongoose from 'mongoose';
import config from './env';
import logger from '../utils/logger';

const RETRY_INTERVAL_MS = 5000;

export async function connectDatabase(): Promise<void> {
  const connect = async () => {
    try {
      logger.info('Attempting to connect to MongoDB...');
      await mongoose.connect(config.mongodbUri);
    } catch (err) {
      logger.error('MongoDB connection failed, retrying in 5s...', err);
      setTimeout(connect, RETRY_INTERVAL_MS);
    }
  };

  mongoose.connection.on('connected', () => {
    logger.info('MongoDB connected successfully');
  });

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  await connect();
}
