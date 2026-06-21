const express = require("express");
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const multer = require("multer");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
app.use(express.json());

const bucketName = process.env.S3_BUCKET || "uploads";

// --- 1. DATABASE SETUP ---
const dbClient = new Client({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
});

dbClient
  .connect()
  .then(async () => {
    console.log("✅ Connected successfully to Postgres!");
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS uploaded_files (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  })
  .catch((err) => console.log("❌ Postgres Connection Failed:", err.message));


// --- 2. STORAGE & S3 CONFIGURATION ---
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Always hold the file in RAM temporarily. The API route will decide where it goes.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

const s3Client = new S3Client({
  region: "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

// Auto-create the bucket on startup
const initBucket = async () => {
  try {
    await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
    console.log(`✅ S3 Bucket '${bucketName}' created successfully.`);
  } catch (err) {
    if (err.name === "BucketAlreadyOwnedByYou" || err.name === "BucketAlreadyExists") {
      console.log(`✅ S3 Bucket '${bucketName}' is ready.`);
    } else {
      console.log(`❌ Failed to create S3 bucket:`, err.message);
    }
  }
};
initBucket();


// --- 3. API ROUTES ---

// POST: Upload File
app.post("/api/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });

  try {
    const fileName = req.file.originalname;
    
    // Safely check headers first, fallback to body, then default to 'local'
    const activeStorageType = req.headers['x-storage-type'] || req.body.storageType || "local";

    console.log(`📤 Upload Request for: ${fileName} (Destination: ${activeStorageType})`);

    if (activeStorageType === "s3") {
      // S3 Path: Send buffer directly to MinIO
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: fileName,
          Body: req.file.buffer, // Because of memoryStorage, this is a valid Buffer!
          ContentType: req.file.mimetype,
        })
      );
    } else {
      // Local Path: Manually write the buffer to the hard drive
      const filePath = path.join(uploadDir, fileName);
      await fs.promises.writeFile(filePath, req.file.buffer);
    }

    // Database: Record BOTH the filename and the storage type
    await dbClient.query(
      "INSERT INTO uploaded_files (filename, type) VALUES ($1, $2)",
      [fileName, activeStorageType]
    );

    res.json({ status: "File uploaded successfully!", mode: activeStorageType });
  } catch (err) {
    console.error("Upload handler failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET: List Files
app.get("/api/files", async (req, res) => {
  try {
    const result = await dbClient.query("SELECT * FROM uploaded_files ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET: Download / View File
app.get("/api/download/:filename", async (req, res) => {
  const targetFile = req.params.filename;
  const activeStorageType = req.query.storageType || "local";

  console.log(`📥 Download Request for: ${targetFile} (Source: ${activeStorageType})`);

  try {
    if (activeStorageType === "s3") {
      console.log(`☁️ Streaming '${targetFile}' from S3 bucket '${bucketName}'...`);
      
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: bucketName,
        Key: targetFile,
      }));

      res.setHeader("Content-Type", response.ContentType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${targetFile}"`);
      return response.Body.pipe(res);
    }

    // Local Download Logic
    const filePath = path.join(uploadDir, targetFile);
    if (fs.existsSync(filePath)) {
      console.log(`📦 Streaming '${targetFile}' from Local Disk...`);
      return res.download(filePath);
    } else {
      console.log(`❌ File '${targetFile}' not found on local disk.`);
      return res.status(404).json({ error: "File not found on local storage." });
    }

  } catch (err) {
    console.error("Download Error:", err.message);
    if (!res.headersSent) {
      if (err.name === 'NoSuchKey') return res.status(404).json({ error: "File not found in S3." });
      return res.status(500).json({ error: "Could not retrieve file." });
    }
  }
});

// DELETE: Reset all data (Wipes DB and Storage)
app.delete("/api/reset", async (req, res) => {
  try {
    // 1. Wipe DB
    await dbClient.query("TRUNCATE TABLE uploaded_files RESTART IDENTITY");

    // 2. Wipe Local Folder
    const files = await fs.promises.readdir(uploadDir);
    for (const file of files) {
      await fs.promises.unlink(path.join(uploadDir, file));
    }

    // 3. Wipe MinIO/S3 Bucket
    const listedObjects = await s3Client.send(new ListObjectsV2Command({ Bucket: bucketName }));
    if (listedObjects.Contents) {
      for (const object of listedObjects.Contents) {
        await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: object.Key }));
      }
    }

    res.json({ message: "System fully reset: Database and Storage wiped!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Reset failed: " + err.message });
  }
});

// --- 4. START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));