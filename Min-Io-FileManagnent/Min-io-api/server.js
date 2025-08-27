require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid")
const Minio = require("minio")
const path = require("path")
const app = express();
const PORT = 4000;
const UserFileModel = require('../../Models/userFileModel').default; //

///////////////////////////////////////////////////////////////////////////////////////



////////////////////////////////////////////////////////////////////////////////


const validateBase64Upload = (base64Data) => {
  const errors = [];

  // Check if required fields exist
  if (!base64Data || !base64Data.content || !base64Data.filename) {
    errors.push(
      "Invalid base64 data format. Must include content and filename"
    );
    return errors;
  }

  // Check if filename is valid
  if (
    typeof base64Data.filename !== "string" ||
    base64Data.filename.trim() === ""
  ) {
    errors.push("Filename must be a non-empty string");
  }

  // Check if content is a string
  if (typeof base64Data.content !== "string") {
    errors.push("Content must be a string");
    return errors;
  }

  // Remove any data URL prefix if present
  let base64String = base64Data.content;
  if (base64String.includes(",")) {
    base64String = base64String.split(",")[1];
  }

  // Check if the string contains valid base64 characters
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(base64String)) {
    errors.push("Content contains invalid base64 characters");
    return errors;
  }

  // Check if the length is valid (must be multiple of 4)
  if (base64String.length % 4 !== 0) {
    errors.push("Content length is not valid for base64");
    return errors;
  }

  // Try to decode the base64 string
  try {
    const buffer = Buffer.from(base64String, "base64");

    // Check if decoding actually produced any data
    if (buffer.length === 0) {
      errors.push("Content decodes to empty data");
      return errors;
    }

    // Check file size
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (buffer.length > MAX_FILE_SIZE) {
      errors.push(
        `File size exceeds limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`
      );
    }

    // Optional: Check if decoded data looks valid for the specified mimetype
    if (base64Data.mimetype) {
      if (base64Data.mimetype.startsWith("image/")) {
        // For images, first few bytes should contain magic numbers
        const isPNG =
          buffer[0] === 0x89 &&
          buffer[1] === 0x50 &&
          buffer[2] === 0x4e &&
          buffer[3] === 0x47;
        const isJPEG =
          buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
        const isGIF =
          buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;

        if (base64Data.mimetype === "image/png" && !isPNG) {
          errors.push("Content is not a valid PNG image");
        } else if (base64Data.mimetype === "image/jpeg" && !isJPEG) {
          errors.push("Content is not a valid JPEG image");
        } else if (base64Data.mimetype === "image/gif" && !isGIF) {
          errors.push("Content is not a valid GIF image");
        }
      }
      // Add more mimetype validations as needed
    }
  } catch (error) {
    errors.push("Invalid base64 content: " + error.message);
  }

  return errors;
};

const validateFileUpload = (file) => {
  const errors = [];

  if (!file) {
    errors.push("No file provided");
    return errors;
  }

  // Add any file validation rules here
  // Example: file size limit
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_FILE_SIZE) {
    errors.push(`File size exceeds limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  return errors;
};

const validateQueryParams = (query) => {
  const errors = [];

  // Validate limit
  const limit = parseInt(query.limit || "10", 10);
  if (isNaN(limit) || limit < 1) {
    errors.push("Limit must be a positive number");
  }

  // Validate dates if provided
  if (query.startDate && isNaN(Date.parse(query.startDate))) {
    errors.push("Invalid startDate format. Use YYYY-MM-DD or ISO date string");
  }
  if (query.endDate && isNaN(Date.parse(query.endDate))) {
    errors.push("Invalid endDate format. Use YYYY-MM-DD or ISO date string");
  }

  return errors;
};


///////
async function listObjects(prefix = "", limit = 10, marker = "") {
  const stream = minioClient.listObjects(bucketName, prefix, true);
  const files = [];
  let count = 0;
  let startFromMarker = !marker;

  return new Promise((resolve, reject) => {
    stream.on("data", (obj) => {
      // If marker is provided, skip until we find it
      if (!startFromMarker) {
        if (obj.name === marker) {
          startFromMarker = true;
        }
        return;
      }

      if (count < limit) {
        const fileInfo = extractFileInfo(obj.name);
        if (fileInfo) {
          files.push({
            objectName: obj.name,
            size: obj.size,
            lastModified: obj.lastModified,
            etag: obj.etag,
            fileId: fileInfo.fileId,
            filename: fileInfo.filename,
            category: fileInfo.category,
          });
          count++;
        }
      }
    });

    stream.on("error", reject);
    stream.on("end", () => resolve(files));
  });
}

async function findObjectByFileId(fileId) {
  const stream = minioClient.listObjects(bucketName, "", true);

  return new Promise((resolve, reject) => {
    stream.on("data", (obj) => {
      if (obj.name.includes(fileId)) {
        resolve(obj);
      }
    });

    stream.on("error", reject);
    stream.on("end", () => resolve(null));
  });
}

function extractFileInfo(objectName) {
  // Object name format: category/fileId-filename
  const parts = objectName.split("/");
  if (parts.length !== 2) return null;

  const category = parts[0];
  const fileIdAndName = parts[1];

  // Find the UUID pattern in the string
  const uuidPattern =
    /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i;
  const uuidMatch = fileIdAndName.match(uuidPattern);

  if (!uuidMatch) return null;

  const fileId = uuidMatch[1];
  // Get everything after the UUID and the hyphen
  const filename = fileIdAndName.substring(fileId.length + 1);

  return {
    category,
    fileId,
    filename,
  };
}

const uploadToMinio = async (fileData, category = "default") => {
  const fileId = uuidv4();
  const objectName = `${category}/${fileId}-${fileData.filename}`;

  await minioClient.putObject(
    bucketName,
    objectName,
    fileData.buffer,
    fileData.buffer.length,
    {
      "Content-Type": fileData.mimetype,
      "x-amz-meta-fileid": fileId,
      "x-amz-meta-filename": fileData.filename,
      "x-amz-meta-category": category,
      "x-amz-meta-userid": fileData.userId || "", //  userId

    }
  );

  return {
    fileId,
    objectName,
    category,
    size: fileData.buffer.length,
    mimetype: fileData.mimetype,
    userId: fileData.userId || null,
    
  };
};

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MinIO Client Setup
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT,
  port: parseInt(process.env.MINIO_PORT, 10),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY
})
const bucketName = process.env.MINIO_BUCKET
// Helper function to ensure bucket exists
async function ensureBucketExists() {
  try {
    const exists = await minioClient.bucketExists(bucketName);
    if (!exists) {
      await minioClient.makeBucket(bucketName, "eu-central-1");
      console.log(`Bucket "${bucketName}" created successfully.`);
    }
  } catch (err) {
    console.error("Error ensuring bucket exists:", err.message);
    throw err;
  }
}

// Multer Setup
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Initialize bucket
ensureBucketExists().catch(console.error);

// File Upload API'S

// app.post('/uploadUrginalFile/api/orginal/file', upload.single("file"), async (req, res) => {
//   try {
//     const { userId, category = "original" } = req.body;
//     console.log(userId);

//     const file = req.file;

//     if (!file || !userId) {
//       return res.status(400).json({ error: 'File and userId are required' });
//     }

//     // 1. ذخیره فایل در MinIO
//     const minioResult = await uploadToMinio({
//       buffer: file.buffer,
//       filename: file.originalname,
//       mimetype: file.mimetype,
//       userId,
//     }, category);
//     console.log('MinIo save',minioResult)




//     // 2. ذخیره اطلاعات در MongoDB
//     const savedRecord = await UserFileModel.create({
//       userId,
//       originalFilename: file.originalname,
//       minioObjectName: minioResult.objectName,
//       fileId: minioResult.fileId,  // از MinIO
//       size: minioResult.size,
//       mimetype: minioResult.mimetype,
//       type: 'original',
//       inputIdFile: null,
//       textAsr: null,
//     });
//     console.log("seve in mongo");
    

//     return res.status(201).json({
//       message: 'File uploaded and saved to MongoDB successfully',
//       fileId: minioResult.fileId,
//       mongoRecordId: savedRecord._id,
//     });
//   } catch (err) {
//     console.error('Server error:', err);
//     return res.status(500).json({ error: 'Server error' });
//   }
// });

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const { category } = req.body;
    const file = req.file;
    const userId = req.body.userId;

    const validationErrors = validateFileUpload(file);
    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors });
    }

    const result = await uploadToMinio(
      {
        buffer: file.buffer,
        filename: file.originalname,
        mimetype: file.mimetype,
        userId
      },
      category
    );

    res.status(201).json({
      message: "File uploaded successfully.",
      ...result,
    });
  } catch (error) {
    console.error("Error uploading file: ", error);
    res.status(500).json({
      error: "Error uploading file",
      message: error.message,
    });
  }
});

// limit to 10 files
app.post("/upload/multiple", upload.array("files", 10), async (req, res) => {
  try {
    const { category, userId } = req.body;
    const files = req.files;

    if (!files || files.length === 0 || !userId) {
      return res.status(400).json({ error: "userId and files are required" });
    }

    const results = [];
    const errors = [];

    await Promise.all(
      files.map(async (file) => {
        try {
          const validationErrors = validateFileUpload(file);
          if (validationErrors.length > 0) {
            errors.push({
              filename: file.originalname,
              errors: validationErrors,
            });
            return;
          }

          const objectName = `${userId}/${uuidv4()}-${file.originalname}`;
          const bucketName = 'uploads';

          await minioClient.putObject(bucketName, objectName, file.buffer);

          const record = await UserFileModel.create({
            userId,
            originalFilename: file.originalname,
            minioObjectName: objectName,
            mimetype: file.mimetype,
            size: file.size,
            category,
          });

          results.push({
            originalname: file.originalname,
            objectName,
            recordId: record._id,
          });
        } catch (error) {
          errors.push({
            filename: file.originalname,
            error: error.message,
          });
        }
      })
    );

    res.status(201).json({
      message: `Uploaded ${results.length} files successfully${errors.length > 0 ? ` with ${errors.length} errors` : ""
        }`,
      successful: results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error uploading files: ", error);
    res.status(500).json({
      error: "Error uploading files",
      message: error.message,
    });
  }
});
// app.post("/upload/base64", uploadBase64Files);

// List Files with pagination and Search Filters
app.get("/files", async (req, res) => {
  try {
    const {
      keyword,
      prefix = "",
      limit = 10,
      marker = "",
      startDate,
      endDate,
      sortBy = "lastModified", // default sort field
      sortOrder = "desc", // default sort order
    } = req.query;

    // Validate query parameters
    const validationErrors = validateQueryParams(req.query);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: "Invalid query parameters",
        details: validationErrors,
      });
    }

    // Get files list with a larger limit for filtering
    const parsedLimit = parseInt(limit, 10);
    const files = await listObjects(
      prefix,
      keyword || startDate || endDate ? parsedLimit * 2 : parsedLimit,
      marker
    );

    // Apply filters if any filter parameter is provided
    let filteredFiles = files;
    if (keyword || startDate || endDate) {
      filteredFiles = files.filter((file) => {
        let matches = true;

        // Keyword filter
        if (keyword) {
          const searchString =
            `${file.objectName} ${file.category}`.toLowerCase();
          matches = matches && searchString.includes(keyword.toLowerCase());
        }

        // Date range filter
        if (matches && (startDate || endDate)) {
          const fileDate = new Date(file.lastModified);

          if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            matches = matches && fileDate >= start;
          }

          if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            matches = matches && fileDate <= end;
          }
        }

        return matches;
      });
    }

    // Sort files
    filteredFiles.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "filename":
          comparison = a.filename.localeCompare(b.filename);
          break;
        case "size":
          comparison = a.size - b.size;
          break;
        case "category":
          comparison = a.category.localeCompare(b.category);
          break;
        case "lastModified":
        default:
          comparison = new Date(a.lastModified) - new Date(b.lastModified);
          break;
      }
      return sortOrder === "desc" ? -comparison : comparison;
    });

    // Apply pagination
    const paginatedFiles = filteredFiles.slice(0, parsedLimit);

    // Prepare response
    const response = {
      files: paginatedFiles,
      nextMarker:
        paginatedFiles.length === parsedLimit
          ? paginatedFiles[paginatedFiles.length - 1].objectName
          : null,
      hasMore: paginatedFiles.length === parsedLimit,
      totalFound: filteredFiles.length,
      query: {
        keyword,
        startDate,
        endDate,
        prefix,
        limit: parsedLimit,
        sortBy,
        sortOrder,
      },
    };

    res.json(response);
  } catch (error) {
    console.error("Error processing files request: ", error);
    res.status(500).json({
      error: "Error processing files request",
      message: error.message,
    });
  }
});

// Read File by fileId
// app.get("/file/:fileId", async (req, res) => {
//   // try {
//   //   const { fileId } = req.params;
//   //   const obj = await findObjectByFileId(fileId);

//   //   if (!obj) {
//   //     return res.status(404).send("File not found");
//   //   }

//   //   const stream = await minioClient.getObject(bucketName, obj.name);

//   //   // Set appropriate headers
//   //   res.setHeader("Content-Type", "application/octet-stream");
//   //   res.setHeader(
//   //     "Content-Disposition",
//   //     `attachment; filename="${path.basename(obj.name)}"`
//   //   );

//   //   stream.pipe(res);
//   // } catch (error) {
//   //   console.error("Error fetching file: ", error);
//   //   res.status(500).send("Error reading file: " + error.message);
//   // }

//   try {
//     const files = await UserFileModel.find({ userId: req.params.userId });
//     res.json({ files });
//   } catch (err) {
//     res.status(500).json({ error: 'Failed to fetch files' });
//   }
// });

// Delete File by fileId
// app.delete("/file/:fileId", async (req, res) => {
//   try {
//     const { fileId } = req.params;
//     console.log(fileId);

//     const obj = await findObjectByFileId(fileId);

//     if (!obj) {
//       return res.status(404).send("File not found");
//     }

//     await minioClient.removeObject(bucketName, obj.name);
//     res.json({
//       message: "File deleted successfully.",
//       fileId,
//       objectName: obj.name,
//     });
//   } catch (error) {
//     console.error("Error deleting file: ", error);
//     res.status(500).send("Error deleting file: " + error.message);
//   }
// });


//////////////////////////////////////

// app.get("/files/by-user", async (req, res) => {
//   const userId = req.query.userId;

//   if (!userId) {
//     return res.status(400).json({ error: "userId query parameter is required" });
//   }

//   try {
//     const stream = minioClient.listObjects(bucketName, "", true);
//     const result = [];

//     stream.on("data", async (obj) => {
//       try {
//         const stat = await minioClient.statObject(bucketName, obj.name);
//         const metaUserId = stat.metaData["x-amz-meta-userid"];

//         // چون metadata ها lowercase ذخیره می‌شن
//         if (metaUserId === userId) {
//           const fileInfo = extractFileInfo(obj.name);
//           result.push({
//             objectName: obj.name,
//             size: obj.size,
//             lastModified: obj.lastModified,
//             etag: obj.etag,
//             fileId: fileInfo?.fileId || null,
//             filename: fileInfo?.filename || null,
//             category: fileInfo?.category || null,
//           });
//         }
//       } catch (err) {
//         console.error(`Error reading metadata for ${obj.name}:`, err.message);
//       }
//     });

//     stream.on("end", () => {
//       res.json({
//         userId,
//         files: result,
//       });
//     });

//     stream.on("error", (err) => {
//       console.error("Error listing objects:", err.message);
//       res.status(500).json({ error: "Failed to list files" });
//     });
//   } catch (err) {
//     console.error("Error fetching files:", err.message);
//     res.status(500).json({ error: "Server error" });
//   }
// });
/////////////////////////////



// Start Server

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});