import express from 'express';
import { LimitFileController } from '../Controler/LimitFileController.js';
const router = express.Router();
router.post('/limit-file',LimitFileController)


export default router