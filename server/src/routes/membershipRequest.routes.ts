import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
  createRequestController,
  createCampusRequestController,
  getUserRequestsController,
} from '../controllers/membershipRequest.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// User submits a membership request for a building
router.post('/', createRequestController);

// User submits a request to be assigned campus infrastructure data entry
router.post('/campus-infrastructure', createCampusRequestController);

// User views their own requests
router.get('/my', getUserRequestsController);

export default router;
