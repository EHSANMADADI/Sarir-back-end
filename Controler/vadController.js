import axios from 'axios';
import https from 'https';
import { minioClient, uploadToMinio } from '../Min-Io-FileManagnent/Min-io-api/utils/uploadToMinio.js';
import UserFileModel from '../Models/userFileModel.js';
import { v4 as uuidv4 } from 'uuid';
import FormData from 'form-data';
import mime from 'mime-types';
import dotenv from "dotenv";

dotenv.config();

export async function vadController(req, res) {
    const startTime = Date.now();
    let userId = null;

    try {
        const { objectName, accessToken, category = 'VadFile',workSpace='test' } = req.body;
        const bucketName = "sarirbucket";
        const ASR_URL = process.env.ASR_URL;

        if (!objectName || !accessToken) {
            return res.status(400).json({ error: 'objectName and accessToken are required' });
        }

        // --- اعتبارسنجی کاربر ---
        const response = await axios.get(
            'http://localhost:3300/api/UserQuery/GetCurrentUser',
            { headers: { accept: 'application/json', Authorization: accessToken } }
        );

        userId = response.data.returnValue?.id;
        if (!userId) return res.status(401).json({ error: 'User not found or invalid access token' });

        // --- پیدا کردن رکورد اصلی ---
        const originalFileRecord = await UserFileModel.findOne({
            userId,
            minioObjectName: objectName,
            type: "original",
        });

        if (!originalFileRecord) {
            return res.status(404).json({ error: "Original file record not found" });
        }

        const originalFilename = originalFileRecord.originalFilename;

        // --- بررسی رکورد ناموفق قبلی ---
        const failedRecord = await UserFileModel.findOne({ userId, originalFilename, status: false });

        // --- گرفتن فایل ورودی از MinIO ---
        const fileStream = await minioClient.getObject(bucketName, objectName);

        // --- ارسال فایل به VAD ---
        const formData = new FormData();
        formData.append('file', fileStream, { filename: `${uuidv4()}-${originalFilename}` });

        const vadResponse = await axios.post(
            `${ASR_URL}/api/vad/file`,
            formData,
            {
                headers: formData.getHeaders(),
                maxBodyLength: Infinity,
            }
        );

        const { output_audio } = vadResponse.data;
        if (!output_audio) throw new Error('VAD processing failed, output_audio not found');

        // --- دانلود خروجی از VAD ---
        const outputAudioUrl = `${ASR_URL}${output_audio}`;
        console.log('url vad', outputAudioUrl);
        const outputResponse = await axios.get(outputAudioUrl, { responseType: 'arraybuffer' });

        const inputBuffer = Buffer.from(outputResponse.data);

        // --- تعیین پسوند و mimetype فایل ---
        const extension = output_audio.split('.').pop().toLowerCase();
        const safeFilename = `${uuidv4()}.${extension}`;
        const mimetype = mime.lookup(extension) || 'application/octet-stream';

        // --- آپلود خروجی به MinIO ---
        const fileData = {
            buffer: inputBuffer,
            filename: safeFilename,
            mimetype,
            userId,
        };
        const minIo = await uploadToMinio(fileData, category);

        const responseTime = Date.now() - startTime;

        // --- حذف رکورد fail قبلی ---
        if (failedRecord) await UserFileModel.deleteOne({ _id: failedRecord._id });

        // --- ذخیره رکورد موفق ---
        const newFile = new UserFileModel({
            userId,
            originalFilename,
            minioObjectName: minIo.objectName,
            MinIofileId: minIo.fileId,
            size: minIo.size,
            mimetype,
            type: 'vad',
            inputIdFile: objectName,
            textAsr: null,
            status: true,
            responseTime,
            workSpace:workSpace
        });
        await newFile.save();

        // --- ارسال خروجی به کاربر ---
        res.setHeader("Content-Type", mimetype);
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(originalFilename)}.${extension}`
        );
        res.send(inputBuffer);

    } catch (error) {
        const responseTime = Date.now() - startTime;
        console.error('Error in VAD Controller:', error);

        const existingFailed = await UserFileModel.findOne({ userId, minioObjectName: req.body.objectName, status: false });
        if (!existingFailed) {
            const originalFileRecord = await UserFileModel.findOne({
                userId,
                minioObjectName: req.body.objectName,
                type: "original",
            });
            const originalFilename = originalFileRecord?.originalFilename || "";

            await UserFileModel.create({
                userId,
                originalFilename,
                minioObjectName: req.body.objectName,
                MinIofileId: '',
                size: 0,
                mimetype: null,
                type: 'vad',
                inputIdFile: req.body.objectName,
                textAsr: null,
                status: false,
                responseTime,
                workSpace:workSpace
            });
        }

        if (error?.response?.status === 401) {
            return res.status(401).json({ error: 'User not found or invalid access token' });
        }

        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}
