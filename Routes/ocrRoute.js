import express from 'express';
import { ocrController } from '../Controler/ocrController.js';
import { ocrDownloadControler } from '../Controler/ocrDownloadControler.js';
const router = express.Router();
router.post('/OCRprocessing',ocrController)
router.get('/download/file/:filename',ocrDownloadControler)

export default router