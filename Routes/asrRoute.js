import express from 'express';
import { asrController } from '../Controler/asrController.js';
const router = express.Router();
router.post('/ASRprocessing',asrController)

export default router