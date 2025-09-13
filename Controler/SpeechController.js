import UserFileModel from '../Models/userFileModel.js';
import { v4 as uuidv4 } from 'uuid';
import FormData from 'form-data';
import mime from 'mime-types';
import axios from 'axios';
import { minioClient, uploadToMinio } from '../Min-Io-FileManagnent/Min-io-api/utils/uploadToMinio.js';
import dotenv from "dotenv";

dotenv.config();

export async function SpeechController(req, res) {
    const startTime = Date.now();
    let userId = null;

    try {
        const { objectName, accessToken, category = 'SpeechFile' } = req.body;
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

        // --- پیدا کردن رکورد ناموفق قبلی ---
        const failedRecord = await UserFileModel.findOne({ userId, originalFilename: objectName, status: false });

        // --- محدودیت حجم ---
        const MAX_SIZE = 2 * 1024 * 1024 * 1024;
        const totalSize = await UserFileModel.aggregate([
            { $match: { userId, type: 'speech' } },
            { $group: { _id: null, total: { $sum: "$size" } } }
        ]);
        const usedSize = totalSize.length > 0 ? totalSize[0].total : 0;
        if (usedSize >= MAX_SIZE) {
            return res.status(402).json({ error: `شما به سقف حجم مجاز (${(MAX_SIZE / (1024 ** 3)).toFixed(2)} GB) رسیده‌اید` });
        }

        // --- دانلود فایل از MinIO ---
        const fileStream = await minioClient.getObject(bucketName, objectName);

        // --- ارسال فایل به سرویس ASR / Speech ---
        const formData = new FormData();
        formData.append('file', fileStream, objectName);
        formData.append('model_type', 'gagnet');

        const SpeechResponse = await axios.post(
            `${ASR_URL}/api/enh/file`,
            formData,
            { headers: formData.getHeaders(), maxBodyLength: Infinity }
        );

        const { output_file } = SpeechResponse.data;
        if (!output_file) throw new Error('Speech processing failed, output_file not found');

        const outputAudioUrl = `${ASR_URL}${output_file}`;
        const outputResponse = await axios.get(outputAudioUrl, { responseType: 'arraybuffer' });
        const fileBuffer = Buffer.from(outputResponse.data);

        // --- استفاده از اسم امن برای ذخیره در MinIO ---
        const originalFilename = objectName; // اسم اصلی فایل
        const safeFilename = `${uuidv4()}-${originalFilename}`;
        const mimetype = mime.lookup(originalFilename) || 'audio/mpeg';

        const fileData = {
            buffer: fileBuffer,
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
            originalFilename,          // اسم فارسی اصلی حفظ شد
            minioObjectName: minIo.objectName,
            MinIofileId: minIo.fileId,
            size: minIo.size,
            mimetype: minIo.mimetype,
            type: 'speech',
            inputIdFile: objectName,
            textAsr: null,
            status: true,
            responseTime
        });
        await newFile.save();

        // --- ارسال فایل خروجی به کاربر با هدر امن ---
        const encodedFilename = encodeURIComponent(originalFilename);
        res.setHeader('Content-Type', mimetype);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
        res.send(fileBuffer);

    } catch (error) {
        const responseTime = Date.now() - startTime;
        console.error('Error in SpeechController:', error);

        // --- ایجاد رکورد ناموفق ---
        const existingFailed = await UserFileModel.findOne({ userId, originalFilename: req.body.objectName, status: false });
        if (!existingFailed) {
            await UserFileModel.create({
                userId,
                originalFilename: req.body.objectName,
                minioObjectName: req.body.objectName,
                MinIofileId: '',
                size: 0,
                mimetype: null,
                type: 'speech',
                inputIdFile: req.body.objectName,
                textAsr: null,
                status: false,
                responseTime
            });
        }

        if (error.response?.status === 401) {
            return res.status(401).json({ error: 'User not found or invalid access token' });
        }

        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}
