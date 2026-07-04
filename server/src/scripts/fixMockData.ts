import mongoose from 'mongoose';
import config from '../config/env';
import { Building } from '../models/Building.model';
import { calculateCombinedCarbon } from '../services/submission.service';
import { redisClient } from '../config/redis';
import logger from '../utils/logger';

async function fixMockData() {
  await mongoose.connect(config.mongodbUri);
  logger.info('Connected to MongoDB');

  const buildings = await Building.find({});
  let count = 0;

  for (const building of buildings) {
    building.overviewStatus = 'verified';
    building.civilStatus = 'verified';
    building.electricalStatus = 'verified';
    building.wasteStatus = 'verified';

    await building.save();

    try {
      const combined = await calculateCombinedCarbon(building._id as any);
      await Building.findByIdAndUpdate(building._id, {
        combinedCarbonResults: combined,
        lastCarbonCalculatedAt: new Date(),
      });
      count++;
    } catch (err) {
      logger.error(`Failed to calculate carbon for ${building._id}`, err);
    }
  }

  logger.info(`Fixed statuses and calculated combined carbon for ${count} buildings.`);

  if (redisClient) {
    logger.info('Flushing Redis cache...');
    await redisClient.flushdb();
    logger.info('Redis cache flushed.');
  }

  await mongoose.disconnect();
}

fixMockData().catch((err) => {
  console.error(err);
  process.exit(1);
});
