import express from 'express';
import { reciveFile } from '../Controler/userFileUploadedControler.js';
import { reciveVadFile } from '../Controler/reciveVadFile.js';
import { reciveSpeechFile } from '../Controler/reciveSpeechFile.js';
import { getFileByMinioId } from '../Controler/getFileByMinioId.js';
import { reciveAsrText } from '../Controler/reciveAsrText.js';
import {getUserFilesByType} from'../Controler/getFileByType.js'
import {reciveSuperFile} from '../Controler/reciveSuperFile.js'
const router = express.Router();
// const upload = multer();
router.get('/api/orginal/file/:accessToken',reciveFile);///recive all OrginalFile user uploaded
router.get('/api/orginal/oneFile/:MinIofileId',getFileByMinioId)
router.get('/api/vad/file/:accessToken',reciveVadFile);
router.get('/api/reciveListFile',getUserFilesByType)
router.get('/api/speech/file/:accessToken',reciveSpeechFile);
router.post('/api/superResolotion/file',reciveSuperFile)
router.get('/api/asr/textFile/:mongorecordedId',reciveAsrText)

export default router