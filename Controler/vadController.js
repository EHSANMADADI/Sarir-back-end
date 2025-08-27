import axios from 'axios';
import https from 'https';
import { minioClient, uploadToMinio } from '../Min-Io-FileManagnent/Min-io-api/utils/uploadToMinio.js';
import UserFileModel from '../Models/userFileModel.js';
import { v4 as uuidv4 } from 'uuid';
import FormData from 'form-data';
import mime from 'mime-types';
import dotenv from "dotenv";

export async function vadController(req, res) {
    const startTime = Date.now();
    let userId = null;
    dotenv.config();

    try {
        const { objectName, accessToken, category = 'VadFile' } = req.body;
        const bucketName = "sarirbucket";
        // const ASR_URL = "http://192.168.4.177:18011"; // سرویس اصلی VAD/ASR
           const ASR_URL=process.env.ASR_URL
           console.log( 'vad',ASR_URL);
           
        if (!objectName || !accessToken) {
            return res.status(400).json({ error: 'objectName and accessToken are required' });
        }

        // --- اعتبارسنجی کاربر ---
        const agent = new https.Agent({ rejectUnauthorized: false });
        const response = await axios.get(
            'https://185.83.112.4:3300/api/UserQuery/GetCurrentUser',
            { httpsAgent: agent, headers: { accept: 'application/json', Authorization: accessToken } }
        );

        userId = response.data.returnValue.id;
        if (!userId) return res.status(401).json({ error: 'User not found or invalid access token' });

        // --- بررسی رکورد ناموفق قبلی ---
        const failedRecord = await UserFileModel.findOne({ userId, originalFilename: objectName, status: false });

        // --- محدودیت حجم ---
        const MAX_SIZE = 2 * 1024 * 1024 * 1024;
        const totalSize = await UserFileModel.aggregate([
            { $match: { userId, type: 'vad' } },
            { $group: { _id: null, total: { $sum: "$size" } } }
        ]);
        const usedSize = totalSize.length > 0 ? totalSize[0].total : 0;
        if (usedSize >= MAX_SIZE) {
            return res.status(402).json({ error: `شما به سقف حجم مجاز (${(MAX_SIZE / (1024 ** 3)).toFixed(2)} GB) رسیده‌اید` });
        }

        // --- گرفتن فایل ورودی از MinIO (به صورت استریم) ---
        const fileStream = await minioClient.getObject(bucketName, objectName);

        // --- ساخت FormData و ارسال مستقیم به ASR ---
        const formData = new FormData();
        formData.append('file', fileStream, objectName);
        // formData.append('model_type', 'gagnet');

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

        // --- گرفتن خروجی از ASR (استریم) ---
        const outputAudioUrl = `${ASR_URL}${output_audio}`;
        const outputResponse = await axios.get(outputAudioUrl, { responseType: 'arraybuffer' });

        // --- آپلود مستقیم خروجی به MinIO ---
        const fileBuffer = Buffer.from(outputResponse.data);
        const filename = `output_${uuidv4()}-${objectName}`;
        const mimetype = mime.lookup(filename) || 'audio/mpeg';

        const fileData = {
            buffer: fileBuffer,
            filename,
            mimetype,
            userId,
        };
        const minIo = await uploadToMinio(fileData, category);

        const responseTime = Date.now() - startTime;

        // حذف رکورد ناموفق قبلی در صورت موفقیت
        if (failedRecord) await UserFileModel.deleteOne({ _id: failedRecord._id });

        // ذخیره رکورد موفق
        const newFile = new UserFileModel({
            userId,
            originalFilename: minIo.originalFilename,
            minioObjectName: minIo.objectName,
            MinIofileId: minIo.fileId,
            size: minIo.size,
            mimetype: minIo.mimetype,
            type: 'vad',
            inputIdFile: objectName,
            textAsr: null,
            status: true,
            responseTime
        });
        await newFile.save();

        // --- ارسال خروجی به کاربر ---
        res.setHeader('Content-Type', mimetype);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(fileBuffer);

    } catch (error) {
        const responseTime = Date.now() - startTime;
        console.error('Error in VAD Controller:', error);

        // ذخیره رکورد ناموفق فقط در صورت نبود قبلی
        const existingFailed = await UserFileModel.findOne({ userId, originalFilename: req.body.objectName, status: false });
        if (!existingFailed) {
            await UserFileModel.create({
                userId,
                originalFilename: req.body.objectName,
                minioObjectName: req.body.objectName,
                MinIofileId: '',
                size: 0,
                mimetype: null,
                type: 'vad',
                inputIdFile: req.body.objectName,
                textAsr: null,
                status: false,
                responseTime
            });
        }

        if (error.status === 401) return res.status(401).json({ error: 'User not found or invalid access token' });

        res.status(500).json({ error: 'Internal server error' });
    }
}
