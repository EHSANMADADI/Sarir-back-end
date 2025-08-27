// Controller: deleteUserFile.js

import UserFileModel from '../Models/userFileModel.js';
import { minioClient} from '../Min-Io-FileManagnent/Min-io-api/utils/uploadToMinio.js'; 

export async function deletFileControler(req, res) {
  try {
    const { mongoRecordId } = req.params;
    const bucketName ="sarirbucket"
    if (!mongoRecordId) {
      return res.status(400).json({ error: 'mongoRecordId is required' });
    }

    // 1. پیدا کردن رکورد در MongoDB
    const fileRecord = await UserFileModel.findById(mongoRecordId);
    if (!fileRecord) {
      return res.status(404).json({ error: 'File record not found' });
    }

    const objectName = fileRecord.minioObjectName;

    // 2. حذف فایل از MinIO
    if (objectName) {
      await minioClient.removeObject(bucketName, objectName);
      console.log(`MinIO: Deleted object ${objectName}`);
    } else {
      console.warn('MinIO object name is missing, skipping MinIO deletion');
    }

    // 3. حذف رکورد از MongoDB
    await UserFileModel.findByIdAndDelete(mongoRecordId);
    console.log(`MongoDB: Deleted record ${mongoRecordId}`);

    return res.status(200).json({ message: 'File and record deleted successfully' });

  } catch (err) {
    console.error('Error deleting file:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
