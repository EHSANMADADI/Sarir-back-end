import express from 'express';
import { workspaceController,getUserWorkspaces} from '../Controler/workspaceController.js';
import { checkUserMiddleware} from "../middlewares/checkUserMiddleware.js";
const router = express.Router();
router.post("/AddWorkspace",checkUserMiddleware,workspaceController);
router.post("/ListworkspaceOfUsers",checkUserMiddleware,getUserWorkspaces)
export default router