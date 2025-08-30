import express from 'express';
import { kwsController } from '../Controler/kwsController.js';
const router = express.Router();
router.post('/processing',kwsController)

export default router