import express from 'express';
import { ocrController } from '../Controler/ocrController.js';
const router = express.Router();
router.post('/OCRprocessing',ocrController)

export default router