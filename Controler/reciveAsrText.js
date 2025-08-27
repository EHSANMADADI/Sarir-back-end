import UserFileModel from '../Models/userFileModel.js';
import { minioClient } from '../Min-Io-FileManagnent/Min-io-api/utils/MinioClient.js';

export async function reciveAsrText(req, res) {
    try {
        const { mongorecordedId } = req.params;

        const file = await UserFileModel.findOne({
            _id: mongorecordedId,
            type: "ASR"
        });

        if (!file) {
            return res.status(404).json({ error: "ASR file not found for the given ID."});
        }

        return res.status(200).json({
            message: "File retrieved successfully",
            data: file
        });

    } catch (err) {
        console.error("Error retrieving file:", err);
        return res.status(500).json({ error: "Server error", details: err.message });
    }
}
