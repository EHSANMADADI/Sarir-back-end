import express from 'express';
import { SpeechController } from '../Controler/SpeechController.js';
const router = express.Router();
router.post('/Speechprocessing',SpeechController)

export default router