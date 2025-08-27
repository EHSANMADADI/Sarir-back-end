import express from 'express';
import {deletFileControler} from '../Controler/deletFileControler.js'
const router = express.Router();
router.delete('/:mongoRecordId',deletFileControler)
export default router; 