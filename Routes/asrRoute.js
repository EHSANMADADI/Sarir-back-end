import express from 'express';
import { asrController } from '../Controler/asrController.js';
import { asrControllerOld } from '../Controler/asrControllerOld.js';
const router = express.Router();
router.post('/ASRprocessing',asrController)
router.post('/ASRprocessingOld',asrControllerOld)

export default router