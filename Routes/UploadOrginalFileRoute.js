import express from 'express';
import multer from 'multer';
import {UploadOrginalFile} from'../Controler/uploadorginalfileControler.js'
const router = express.Router();
const upload = multer();
router.post('/api/orginal/file', upload.single('file'), UploadOrginalFile);

export default router




