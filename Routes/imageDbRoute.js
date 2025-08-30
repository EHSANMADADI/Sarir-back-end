import express from 'express';
import { imgDbController } from '../Controler/imgDbController.js';
const router = express.Router();
router.post('/processing',imgDbController)

export default router