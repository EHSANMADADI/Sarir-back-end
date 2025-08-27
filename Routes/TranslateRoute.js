import express from 'express';
import { transController } from '../Controler/transController.js'
const router = express.Router();
router.post('/generate', transController)

export default router