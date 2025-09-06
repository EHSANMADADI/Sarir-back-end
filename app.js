import express from 'express';
import athRouter from './Routes/athRouter.js';
import UploadOrginalFileRoute from './Routes/UploadOrginalFileRoute.js'
import userFileUplodedRoute from './Routes/userFileUplodedRoute.js'
import deleteFileRoute from './Routes/deleteFileRoute.js'
import vadRoute from './Routes/vadRoute.js'
import speechRoute from './Routes/speechRoute.js'
import asrRoute from './Routes/asrRoute.js'
import ocrRoute from './Routes/ocrRoute.js'
import LimitRoute from'./Routes/LimitRoute.js'
import cors from "cors";
import path from 'path';
import { fileURLToPath } from 'url';
import superResolationRoute from './Routes/superResolationRoute.js'
import TranslateRoute from './Routes/TranslateRoute.js'
import imageDbRoute from './Routes/imageDbRoute.js'
import kwsRoute from './Routes/kwsRoute.js'
import graphRoute from './Routes/graphRoute.js'
const app = express();
app.use(cors());
app.use(express.json());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'out')));
app.use("/graphe", express.static(path.join(__dirname, "build-graph")));

app.use('/api/ath', athRouter);
app.use('/uploadUrginalFile', UploadOrginalFileRoute)
app.use('/reciveFile', userFileUplodedRoute)
app.use('/deletFile', deleteFileRoute)
app.use('/vad', vadRoute)
app.use('/speech', speechRoute)
app.use('/ASR', asrRoute)
app.use('/ocr',ocrRoute)
app.use('/api',LimitRoute)
app.use('/superResolation',superResolationRoute)
app.use('/translate',TranslateRoute)
app.use('/ImageDb',imageDbRoute)
app.use('/KWS',kwsRoute)
app.use('/graph',graphRoute)

export default app;
