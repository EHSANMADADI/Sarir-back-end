import express from 'express';
import { workspaceController,getUserWorkspaces,deleteWorkspace,renameWorkspace} from '../Controler/workspaceController.js';
import { checkUserMiddleware} from "../middlewares/checkUserMiddleware.js";
const router = express.Router();
router.post("/AddWorkspace",checkUserMiddleware,workspaceController);
router.post("/ListworkspaceOfUsers",checkUserMiddleware,getUserWorkspaces)
router.delete("/deleteworkspace/:workspaceId", checkUserMiddleware, deleteWorkspace);
router.post("/renameWorkspace",checkUserMiddleware,renameWorkspace)
export default router