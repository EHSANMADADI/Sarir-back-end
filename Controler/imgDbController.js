import axios from "axios";
import { minioClient } from "../Min-Io-FileManagnent/Min-io-api/utils/uploadToMinio.js";
import UserFileModel from "../Models/userFileModel.js";
import FormData from "form-data";

export async function imgDbController(req, res) {
    const startTime = Date.now();
    const { objectName, accessToken } = req.body;

    if (!objectName || !accessToken) {
        return res
            .status(400)
            .json({ error: "objectName و accessToken الزامی هستند." });
    }

    try {
        // 1️⃣ احراز هویت کاربر
        const userResponse = await axios.get(
            "http://185.83.112.4:3300/api/UserQuery/GetCurrentUser",
            {
                headers: {
                    accept: "application/json",
                    Authorization: accessToken,
                },
            }
        );

        const userId = userResponse.data.returnValue?.id;
        if (!userId) {
            return res
                .status(401)
                .json({ error: "User not found or invalid access token" });
        }

        const failedRecord = await UserFileModel.findOne({
            userId,
            originalFilename: objectName,
            status: false,
        });
        // 2️⃣ گرفتن فایل از MinIO (استریم مستقیم)
        const fileStream = await minioClient.getObject("sarirbucket", objectName);

        // 3️⃣ ساخت FormData و ارسال به API پردازش
        const formData = new FormData();
        formData.append("image", fileStream, objectName);

        const apiResponse = await axios.post(
            "http://192.168.4.177:17020/generate",
            formData,
            {
                headers: formData.getHeaders(),
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            }
        );
        console.log(apiResponse.data.JSON);


        // 4️⃣ ذخیره نتیجه در MongoDB
        const totalTime = Date.now() - startTime;
        if (failedRecord) await UserFileModel.deleteOne({ _id: failedRecord._id });
        const newFile = new UserFileModel({
            userId,
            originalFilename: objectName,
            minioObjectName: objectName,
            MinIofileId: "",
            size: 0,
            type: "IMGdb",
            inputIdFile: objectName,
            textAsr: null,
            wordASR: null,
            status: true,
            responseTime: totalTime,
            responseSuper: apiResponse.data.JSON
        });
        await newFile.save();

        return res.status(200).json({
            message: "IMAGEdB completed and data stored successfully",
            response: apiResponse.data.JSON,
            mongoRecordedId: newFile._id,
        });



    } catch (error) {
        const existingFailed = await UserFileModel.findOne({
            userId,
            originalFilename: req.body.objectName,
            status: false,
        });

        if (!existingFailed) {
            await new UserFileModel({
                userId: userId || null,
                originalFilename: req.body.objectName || "",
                minioObjectName: req.body.objectName || "",
                MinIofileId: "",
                size: 0,
                type: "IMGdb",
                inputIdFile: req.body.objectName || "",
                textAsr: null,
                wordASR: [],
                status: false,
                responseTime: totalTime,
                responseSuper:null
            }).save();
        }

        if (err.status == 401) {
            return res
                .status(401)
                .json({ error: "User not found or invalid access token" });
        }

        return res
            .status(500)
            .json({ error: "Internal server error", details: err.message });
    }
}

