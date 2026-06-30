import type { ICampusCarbonResults } from './submission.types';

export enum BuildingType {
  ACADEMIC = 'academic',
  HOSTEL = 'hostel',
  LAB = 'lab',
  ADMINISTRATIVE = 'administrative',
  RESIDENTIAL = 'residential',
  COMMERCIAL = 'commercial',
  INFRASTRUCTURE = 'infrastructure',
}

export enum SubmissionStatus {
  NOT_STARTED = 'not_started',
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  VERIFIED = 'verified',
  REVISION_REQUESTED = 'revision_requested',
}

// ── CAMPUS IDENTITY — top-level multi-campus entity ──────────────────────────

export interface ICampus {
  _id: string;
  slug: string; // URL-friendly key e.g. "iitbhu" — unique, lowercase, no spaces
  name: string; // "IIT BHU Campus"
  institution: string; // "Indian Institute of Technology (BHU) Varanasi"
  shortName?: string; // "IIT BHU"
  city: string; // "Varanasi"
  state: string; // "Uttar Pradesh"
  country: string; // "India"
  totalAreaAcres?: number;
  establishedYear?: number;
  website?: string;
  contactEmail?: string;
  description?: string;

  // Section statuses (same lifecycle as building sections)
  overviewStatus: 'not_started' | 'draft' | 'submitted' | 'verified' | 'revision_requested';
  overviewVersion: number;

  infrastructureStatus: 'not_started' | 'draft' | 'submitted' | 'verified' | 'revision_requested';
  infrastructureVersion: number;
  infrastructureCarbonResults?: ICampusCarbonResults;

  isActive: boolean;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Lightweight summary for the campus list page
export interface ICampusSummary {
  _id: string;
  slug: string;
  name: string;
  institution: string;
  shortName?: string;
  city: string;
  country: string;
  totalAreaAcres?: number;
  buildingCount: number;
  verifiedBuildingCount: number;
  overviewStatus: string;
  infrastructureStatus: string;
  isActive: boolean;
}

export interface IBuilding {
  _id: string;
  name: string;
  shortName?: string;
  type: BuildingType;
  description?: string;
  floors: number;
  totalArea?: number;
  yearBuilt?: number;
  latitude?: number;
  longitude?: number;
  assignedMembers: string[];
  submissionStatus: SubmissionStatus;
  lastSubmissionId?: string;
  isActive: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}
