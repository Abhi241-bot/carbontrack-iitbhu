/**
 * Idempotent seed for emission factors (Annexure 8 + historical CEA grid data).
 * Upserts on { category, name } — safe to re-run without creating duplicates.
 *
 * Run: npm run seed:ef  (from server/)
 */
import mongoose from 'mongoose';
import { EmissionFactor } from '../models/EmissionFactor.model';
import config from '../config/env';
import { EMISSION_FACTORS_EXTENDED } from '../seeds/emissionFactors.extended.seed';

async function seedEmissionFactors() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(config.mongodbUri);
  console.log('Connected.');

  let count = 0;
  for (const entry of EMISSION_FACTORS_EXTENDED) {
    await EmissionFactor.findOneAndUpdate(
      { category: entry.category, name: entry.name },
      { $set: entry },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    count++;
  }

  console.log(`Seed complete: ${count} factors upserted.`);
  await mongoose.disconnect();
  process.exit(0);
}

seedEmissionFactors().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
