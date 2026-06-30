import mongoose from 'mongoose';
import config from '../config/env';
import { Building } from '../models/Building.model';
import { EmissionFactor } from '../models/EmissionFactor.model';
import User from '../models/User.model';
import Campus from '../models/Campus.model';
import { BUILDINGS_SEED } from './buildings.seed';
import { EMISSION_FACTORS_SEED } from './emissionFactors.seed';
import { EMISSION_FACTORS_EXTENDED } from './emissionFactors.extended.seed';
import logger from '../utils/logger';

export async function seedDatabase(): Promise<void> {
  // ── 1. CREATE OR FIND IIT BHU CAMPUS ──────────────────────────────────────
  let iitbhuCampus = await Campus.findOne({ slug: 'iitbhu' });

  if (!iitbhuCampus) {
    iitbhuCampus = await Campus.create({
      slug: 'iitbhu',
      name: 'IIT BHU Campus',
      institution: 'Indian Institute of Technology (BHU) Varanasi',
      shortName: 'IIT BHU',
      city: 'Varanasi',
      state: 'Uttar Pradesh',
      country: 'India',
      totalAreaAcres: 1350,
      establishedYear: 1919,
      website: 'https://iitbhu.ac.in',
      contactEmail: 'registrar@iitbhu.ac.in',
      description:
        'IIT (BHU) Varanasi is one of the oldest technical institutions in India, established in 1919.',
      infrastructureData: {
        roads: { segments: [], hasStreetLighting: false },
        vegetation: {
          categories: [
            {
              id: 'veg-native',
              categoryType: 'native_trees',
              definitionScope: 'e.g. Neem, Banyan, Peepal',
            },
            {
              id: 'veg-ornamental',
              categoryType: 'ornamental_trees',
              definitionScope: 'e.g. Gulmohar, Ashoka, Silver Oak',
            },
            {
              id: 'veg-shrubs',
              categoryType: 'shrubs_grassland',
              definitionScope: 'e.g. native grass species',
            },
            {
              id: 'veg-agroforestry',
              categoryType: 'agroforestry',
              definitionScope: 'e.g. Mango, Teak',
            },
            {
              id: 'veg-arboriculture',
              categoryType: 'arboriculture',
              definitionScope: 'Street trees, heritage trees',
            },
          ],
        },
        waterBodies: { waterBodies: [] },
      },
    });
    logger.info(`Campus created: IIT BHU (slug: iitbhu, id: ${iitbhuCampus._id})`);
  } else {
    logger.info(`Campus already exists: IIT BHU (slug: iitbhu, id: ${iitbhuCampus._id})`);
  }

  // ── 2. SEED EMISSION FACTORS ───────────────────────────────────────────────
  // Legacy factors: insert once if DB is empty
  const efCount = await EmissionFactor.countDocuments();
  if (efCount === 0) {
    logger.info('Seeding legacy emission factors...');
    await EmissionFactor.insertMany(EMISSION_FACTORS_SEED);
    logger.info(`Inserted ${EMISSION_FACTORS_SEED.length} legacy emission factors`);
  }

  // Extended (Annexure 8) factors: always upsert so new categories are added
  // on every deploy without needing a manual seed:ef run.
  let efUpserted = 0;
  for (const entry of EMISSION_FACTORS_EXTENDED) {
    await EmissionFactor.findOneAndUpdate(
      { category: entry.category, name: entry.name },
      { $set: entry },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    efUpserted++;
  }
  logger.info(`Upserted ${efUpserted} extended emission factors`);

  // ── 3. SEED BUILDINGS WITH campusId ───────────────────────────────────────
  const existingBuildingCount = await Building.countDocuments();

  if (existingBuildingCount === 0) {
    logger.info('Seeding buildings...');
    const buildingsWithCampus = BUILDINGS_SEED.map((b) => ({
      ...b,
      campusId: iitbhuCampus!._id,
    }));
    await Building.insertMany(buildingsWithCampus);
    logger.info(`Inserted ${buildingsWithCampus.length} buildings for IIT BHU campus`);
  } else {
    // Backfill: existing buildings without campusId get the IIT BHU campus id
    const buildingsWithoutCampus = await Building.countDocuments({ campusId: { $exists: false } });
    if (buildingsWithoutCampus > 0) {
      await Building.updateMany(
        { campusId: { $exists: false } },
        { $set: { campusId: iitbhuCampus!._id } }
      );
      logger.info(`Backfilled campusId for ${buildingsWithoutCampus} existing buildings`);
    } else {
      logger.info('Buildings already seeded with campusId. Skipping.');
    }
  }

  // ── 4. SEED ADMIN USER ────────────────────────────────────────────────────
  logger.info('Checking default admin user...');
  const adminExists = await User.findOne({ role: 'admin' });
  if (!adminExists) {
    await User.create({
      name: 'Portal Admin',
      email: 'admin@itbhu.ac.in',
      password: config.adminDefaultPassword,
      role: 'admin',
      isEmailVerified: true,
      department: 'Administration',
    });
    logger.info('Admin user created: admin@itbhu.ac.in');
  } else {
    logger.info('Admin user already exists. Skipping.');
  }

  logger.info('Seeding complete!');
}

// Run directly: ts-node src/seeds/index.ts
if (require.main === module) {
  mongoose.connect(config.mongodbUri).then(async () => {
    await seedDatabase();
    await mongoose.disconnect();
    process.exit(0);
  });
}
