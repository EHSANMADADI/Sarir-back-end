import express from 'express';
import { superResolationContoroler } from '../Controler/superResolationContoroler.js';
const router = express.Router();
router.post('/gfgpan',superResolationContoroler)

export default router