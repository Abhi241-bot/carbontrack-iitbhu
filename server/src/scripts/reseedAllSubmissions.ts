import mongoose from 'mongoose';
import config from '../config/env';
import { Building } from '../models/Building.model';
import User from '../models/User.model';
import { Submission } from '../models/Submission.model';
import logger from '../utils/logger';
import { calculateCombinedCarbon } from '../services/submission.service';
import { loadEmissionFactors } from '../engine/efLoader';
import { buildEngineInput } from '../engine/adapter';
import { calculateEmbodiedCarbon } from '../engine/embodied';
import { calculateOperationalCarbon } from '../engine/operational';
import { calculateWasteCarbon } from '../engine/waste';
import { redisClient } from '../config/redis';

async function reseed() {
  await mongoose.connect(config.mongodbUri);
  logger.info('Connected to MongoDB');

  const admin = await User.findOne({ email: 'admin@itbhu.ac.in' });
  if (!admin) {
    logger.error('Admin user not found. Please run npm run seed first.');
    process.exit(1);
  }

  const buildings = await Building.find({});
  if (buildings.length === 0) {
    logger.error('No buildings found. Please run npm run seed first.');
    process.exit(1);
  }

  logger.info(`Found ${buildings.length} buildings. Seeding and calculating submissions...`);
  
  const factors = await loadEmissionFactors();

  let count = 0;
  for (const building of buildings) {
    // Generate some random looking but plausible carbon data inputs
    const wood = Math.floor(Math.random() * 2000) + 500;
    const steel = Math.floor(Math.random() * 3000) + 1000;
    const plastic = Math.floor(Math.random() * 1000) + 200;
    const glass = Math.floor(Math.random() * 500) + 100;

    const kwh = Math.floor(Math.random() * 30000) + 15000; // Snappy consumption
    const solar = Math.random() > 0.5 ? Math.floor(Math.random() * 30) + 5 : 0;

    const solidKg = Math.floor(Math.random() * 150) + 20;
    const liquidLitres = Math.floor(Math.random() * 4000) + 1000;

    const lifespan = 50;

    const overviewData = {
      buildingName: building.name,
      buildingType: building.type,
      numberOfFloors: building.floors,
      operatingHoursPerDay: 10,
      operatingDaysPerWeek: 6,
      peakMonths: ['april', 'may', 'september', 'october'],
      acUsageMonths: ['april', 'may', 'june', 'july', 'august'],
      occupancyDuringBreaks: 'partial' as const,
    };

    // Overview submission
    await Submission.findOneAndUpdate(
      { buildingId: building._id, section: 'overview', status: 'verified' },
      {
        buildingId: building._id,
        submittedBy: admin._id,
        section: 'overview',
        lifecycle: 'static',
        status: 'verified',
        data: overviewData,
        carbonResults: {
          embodiedCarbon: 0,
          operationalCarbonPerYear: 0,
          wasteCarbonPerYear: 0,
          breakdown: {},
          calculatedAt: new Date()
        },
        confidenceScore: 100
      },
      { upsert: true, new: true }
    );

    const sections = ['civil', 'electrical', 'waste'] as const;
    const sectionData: Record<string, any> = {};

    sectionData.civil = {
      structure: {
        entryMode: 'cumulative',
        roomInputMode: 'quick',
        rooms: [],
      },
      materials: {
        woodenFurnitureKg: wood,
        steelFurnitureKg: steel,
        plasticKg: plastic,
        glassKg: glass,
        cementBags: Math.floor(Math.random() * 500) + 100,
        steelRebarKg: Math.floor(Math.random() * 10000) + 2000,
      }
    };

    sectionData.electrical = {
      energy: {
        entryMode: 'cumulative',
        primarySource: 'grid',
        monthlyConsumptionKwh: kwh,
        isEstimated: false,
        solarCapacityKw: solar,
        customEnergySources: []
      },
      appliances: {
        categories: {
          lighting: { kwh: kwh * 0.3, co2: kwh * 0.3 * 0.716 },
          cooling: { kwh: kwh * 0.4, co2: kwh * 0.4 * 0.716 },
          computing: { kwh: kwh * 0.15, co2: kwh * 0.15 * 0.716 },
          labEquipment: { kwh: kwh * 0.1, co2: kwh * 0.1 * 0.716 },
          misc: { kwh: kwh * 0.05, co2: kwh * 0.05 * 0.716 }
        }
      }
    };

    sectionData.waste = {
      waste: {
        solidWasteKgPerDay: solidKg,
        wastewaterLitresPerDay: liquidLitres,
        solidWasteDisposalMethod: 'landfill',
        wastewaterTreatmentType: 'stp'
      }
    };

    for (const section of sections) {
      const data = sectionData[section];
      const estimatedFields: string[] = [];

      let carbonResults: any = {};

      if (section === 'civil') {
        const engineInput = buildEngineInput(overviewData, data, undefined, undefined);
        const result = calculateEmbodiedCarbon(engineInput, factors, estimatedFields);
        carbonResults = {
          embodiedCarbon: result.total,
          breakdown: result.breakdown,
        };
      } else if (section === 'electrical') {
        const engineInput = buildEngineInput(overviewData, undefined, data, undefined);
        const result = calculateOperationalCarbon(engineInput, factors, estimatedFields);
        carbonResults = {
          operationalCarbonPerYear: result.total,
          breakdown: { byScope: { scope1: result.scope1, scope2: result.scope2, scope3: 0 } },
        };
      } else if (section === 'waste') {
        const engineInput = buildEngineInput(overviewData, undefined, undefined, data);
        const usageForEngine = {
          operatingHoursPerDay: overviewData.operatingHoursPerDay ?? 10,
          operatingDaysPerWeek: overviewData.operatingDaysPerWeek ?? 6,
        };
        const result = calculateWasteCarbon(
          engineInput.waste as Parameters<typeof calculateWasteCarbon>[0],
          usageForEngine,
          building.type,
          factors,
          estimatedFields
        );
        carbonResults = {
          wasteCarbonPerYear: result.total,
          breakdown: {
            byCategory: {
              solidWaste: result.solidWasteCO2ePerYear,
              liquidWaste: result.liquidWasteCO2ePerYear,
              waste: result.total
            }
          }
        };
      }

      await Submission.findOneAndUpdate(
        { buildingId: building._id, section: section, status: 'verified' },
        {
          buildingId: building._id,
          submittedBy: admin._id,
          section: section as any,
          lifecycle: section === 'civil' ? 'static' : 'dynamic',
          status: 'verified',
          carbonResults: {
            ...carbonResults,
            calculatedAt: new Date()
          },
          data: data,
          confidenceScore: 85 + Math.floor(Math.random() * 10)
        },
        { upsert: true, new: true }
      );
      count++;
    }

    // Set building statuses to verified
    building.overviewStatus = 'verified';
    building.civilStatus = 'verified';
    building.electricalStatus = 'verified';
    building.wasteStatus = 'verified';
    await building.save();

    // Now calculate combined building carbon results
    try {
      const combined = await calculateCombinedCarbon(building._id as any);
      await Building.findByIdAndUpdate(building._id, {
        combinedCarbonResults: combined,
        lastCarbonCalculatedAt: new Date(),
      });
    } catch (err) {
      logger.error(`Failed to calculate combined carbon for ${building.name}`, err);
    }
  }

  logger.info(`Reseeded and calculated ${count} verified submissions & buildings!`);

  if (redisClient) {
    logger.info('Flushing Redis cache...');
    await redisClient.flushdb();
    logger.info('Redis cache flushed.');
  }

  await mongoose.disconnect();
}

reseed().catch((err) => {
  console.error(err);
  process.exit(1);
});
