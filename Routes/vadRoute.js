import express from 'express';
import { vadController } from '../Controler/vadController.js';
const router = express.Router();
router.post('/Vadprocessing',vadController)

export default router