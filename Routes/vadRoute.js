import express from 'express';
import { vadController } from '../Controler/vadController.js';
import { checkStorageLimit } from "../middlewares/checkStorageLimit.js";
import { checkUserMiddleware } from "../middlewares/checkUserMiddleware.js";
const router = express.Router();
router.post(
    "/Vadprocessing",
    checkUserMiddleware,
    checkStorageLimit("vad", 5 * 1024 * 1024 * 1024), ///type=vad
    vadController
);
export default router