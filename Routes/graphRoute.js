import express from 'express';
import { graphController } from '../Controler/graphController.js';
const router = express.Router();
router.post('/processing',graphController)

export default router