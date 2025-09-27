import mongoose from 'mongoose';
const userFileSchema = new mongoose.Schema({
    userId: {
        type: String,
        ref: 'users',
        required: true,
    },
    originalFilename: {
        type: String,
        required: true,
    },
    minioObjectName: {
        type: String,
        required: true,
    },
    MinIofileId: {
        type: String,
        require: false
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    size: {
        type: Number,
        require: false,
        default: 0
    },
    mimetype: String,
    type: {
        type: String,
        required: true,
    },////for example vad,orginal,...
    inputIdFile: {/// This field tells what file this file was generated from. if inputId=null This means that this file is original and was not created from another file.
        type: String,
        default: null,
        required: false
    },
    textAsr: {//If a file is created and its text is extracted(asr), its text is stored in this field, otherwise its value is defined as null.
        type: String,
        default: null,
        required: false
    },
    wordASR: [
        {
            text: { type: String, required: true },
            start: { type: Number, required: true },
            end: { type: Number, required: true }
        }
    ],

    responseOcr: {
        type: mongoose.Schema.Types.Mixed,
        require: false,
        default: null

    },
    responseSuper: {   // 🔹 فیلد جدید برای نگهداری هر نوع داده
        type: mongoose.Schema.Types.Mixed,
        require: false,
        default: null
    },
    responseImgDb: {
        type: mongoose.Schema.Types.Mixed,
        require: false,
        default: null
    },
    responsegroph: {
        type: mongoose.Schema.Types.Mixed,
        require: false,
        default: null
    },
    status: {
        type: Boolean,
        default: false
    },


    ///////ResponseTime:ms
    responseTime: {
        type: Number,
        default: 0
    },
    kwsResponse: { type: mongoose.Schema.Types.Mixed, default: null },

    // 🔹  kws فایل‌های پشتیبان ارسال‌شده همراه این درخواست
    supportFiles: {
        type: [String], // لیستی از objectName ها
        default: []
    },

    ocrJsonPath: {
        type: String,
        require: false
    },
    ocrImages: {
        type: [{ type: String }],
        require: false
    },
    ocrPdf: {
        type: String,
        require: false
    },
    ocrDocx: {
        type: String,
        require: false
    },
    ocrText: {
        type: [String],
        require: false
    }


});

const UserFileModel = mongoose.model('userFiles', userFileSchema);
export default UserFileModel;
