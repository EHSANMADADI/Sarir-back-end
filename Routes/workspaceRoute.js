import express from 'express';
import { workspaceController } from '../Controler/workspaceController.js';
import { checkUserMiddleware } from "../middlewares/checkUserMiddleware.js";
const router = express.Router();
router.post(
    "/AddWorkspace",checkUserMiddleware,workspaceController);
export default router