import mongoose from 'mongoose';
import config from './env';
import logger from '../utils/logger';

const RETRY_INTERVAL_MS = 5000;

// Cache the connection in the module scope so warm invocations
// in serverless environments (Vercel) reuse the existing socket.
let _connectionPromise: Promise<void> | null = null;

export async function connectDatabase(): Promise<void> {
  // If already connected, no-op
  if (mongoose.connection.readyState === 1) {
    return;
  }

  // If a connection is in progress (e.g. parallel cold-start invocations),
  // wait for the same promise instead of opening a second connection.
  if (_connectionPromise) {
    return _connectionPromise;
  }

  _connectionPromise = (async () => {
    const connect = async () => {
      try {
        logger.info('Attempting to connect to MongoDB...');
        await mongoose.connect(config.mongodbUri, {
          serverSelectionTimeoutMS: 10000,
          socketTimeoutMS: 45000,
          maxPoolSize: 10,
        });
      } catch (err) {
        logger.error('MongoDB connection failed, retrying in 5s...', err);
        _connectionPromise = null; // allow retry on next call
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
      _connectionPromise = null; // reset so next request reconnects
    });

    await connect();
  })();

  return _connectionPromise;
}

