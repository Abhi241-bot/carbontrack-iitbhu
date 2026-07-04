import mongoose from 'mongoose';
import config from '../config/env';
import { Building } from '../models/Building.model';
import User from '../models/User.model';
import { Submission } from '../models/Submission.model';
import logger from '../utils/logger';

async function seedSubmissions() {
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

  logger.info(`Found ${buildings.length} buildings. Seeding mock submissions...`);

  let count = 0;
  for (const building of buildings) {
    // Generate some random looking but plausible carbon data inputs
    const wood = Math.floor(Math.random() * 2000) + 500;
    const steel = Math.floor(Math.random() * 3000) + 1000;
    const plastic = Math.floor(Math.random() * 1000) + 200;
    const glass = Math.floor(Math.random() * 500) + 100;

    const kwh = Math.floor(Math.random() * 30000) + 5000;
    const solar = Math.random() > 0.5 ? Math.floor(Math.random() * 30) + 5 : 0;

    const solidKg = Math.floor(Math.random() * 150) + 20;
    const liquidLitres = Math.floor(Math.random() * 4000) + 1000;

    const lifespan = 50;

    // Overview submission
    await Submission.findOneAndUpdate(
      { buildingId: building._id, section: 'overview', status: 'verified' },
      {
        buildingId: building._id,
        submittedBy: admin._id,
        section: 'overview',
        lifecycle: 'static',
        status: 'verified',
        data: {
          buildingName: building.name,
          buildingType: building.type,
          numberOfFloors: building.floors,
          operatingHoursPerDay: 10,
          operatingDaysPerWeek: 6,
          peakMonths: ['april', 'may', 'september', 'october'],
          acUsageMonths: ['april', 'may', 'june', 'july', 'august'],
          occupancyDuringBreaks: 'partial',
        },
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

    const sections = ['civil', 'electrical', 'waste'];
    for (const section of sections) {
      let data: any = {};
      
      if (section === 'civil') {
        data = {
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
      } else if (section === 'electrical') {
        data = {
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
      } else if (section === 'waste') {
        data = {
          waste: {
            solidWasteKgPerDay: solidKg,
            wastewaterLitresPerDay: liquidLitres,
            solidWasteDisposalMethod: 'landfill',
            wastewaterTreatmentType: 'stp'
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
            embodiedCarbon: 0,
            embodiedCarbonPerYear: 0,
            operationalCarbonPerYear: 0,
            wasteCarbonPerYear: 0,
            breakdown: {},
            calculatedAt: new Date()
          },
          data: data,
          confidenceScore: 85 + Math.floor(Math.random() * 10)
        },
        { upsert: true, new: true }
      );
      count++;
    }
  }

  logger.info(`Successfully seeded ${count} verified submissions!`);
  await mongoose.disconnect();
}

seedSubmissions().catch((err) => {
  console.error(err);
  process.exit(1);
});
