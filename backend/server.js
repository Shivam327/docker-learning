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

// --- 1. CONFIGURATION STRATEGY ---
const STORAGE_TYPE = process.env.STORAGE_TYPE ;
const bucketName = process.env.S3_BUCKET ;

// --- 2. DATABASE SETUP ---
const dbClient = new Client({
  host: process.env.DB_HOST ,
  user: process.env.DB_USER ,
  password: process.env.DB_PASSWORD ,
  database: process.env.DB_NAME ,
  port: process.env.DB_PORT ,
});

dbClient
  .connect()
  .then(async () => {
    console.log("✅ Connected successfully to Postgres!");
    await dbClient.query(`
            CREATE TABLE IF NOT EXISTS uploaded_files (
                id SERIAL PRIMARY KEY,
                filename TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
  })
  .catch((err) => console.log("❌ Postgres Connection Failed:", err.message));

// --- 3. DYNAMIC STORAGE ADAPTER ---
let upload;
let s3Client;
const uploadDir = path.join(__dirname, "uploads");

console.log(`⚙️ Storage Type: ${STORAGE_TYPE}`);

if (STORAGE_TYPE === "s3") {
  console.log("☁️ Storage Mode: S3 Object Storage (MinIO)");
  s3Client = new S3Client({
    region: "us-east-1", // MinIO requires a region string, even a fake one
    endpoint: process.env.S3_ENDPOINT || "http://minio:9000",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || "admin_user",
      secretAccessKey: process.env.S3_SECRET_KEY || "super_secret_key",
    },
    forcePathStyle: true, // Mandatory setting for MinIO to work properly
  });

  // --- NEW: Auto-create the bucket on startup ---
  const initBucket = async () => {
    try {
      await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
      console.log(`✅ S3 Bucket '${bucketName}' created successfully.`);
    } catch (err) {
      // Ignore errors if the bucket already exists
      if (
        err.name === "BucketAlreadyOwnedByYou" ||
        err.name === "BucketAlreadyExists"
      ) {
        console.log(`✅ S3 Bucket '${bucketName}' is ready.`);
      } else {
        console.log(`❌ Failed to create S3 bucket:`, err.message);
      }
    }
  };
  initBucket();
  // ----------------------------------------------

  // Hold file in RAM temporarily so we can stream it to the bucket
  upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
  });
} else {
  console.log("📦 Storage Mode: LOCAL Block Storage");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const diskStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, file.originalname),
  });

  // Save file directly to the hard drive
  upload = multer({
    storage: diskStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
  });
}

const getSecureDownloadUrl = async (key) => {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });
  // Link expires in 3600 seconds (1 hour)
  return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
};

// --- 4. API ROUTES ---

// POST: Upload File
app.post("/api/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });

  try {
    const fileName = req.file.originalname;

    if (STORAGE_TYPE === "s3") {
      // Push the file buffer straight into the MinIO bucket
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: fileName,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        }),
      );
    }
    // If local, Multer already saved it to the disk for us!

    // Record the file in the database
    await dbClient.query("INSERT INTO uploaded_files (filename) VALUES ($1)", [
      fileName,
    ]);

    res.json({ status: "File uploaded successfully!", mode: STORAGE_TYPE });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET: List Files
app.get("/api/files", async (req, res) => {
  try {
    const result = await dbClient.query(
      "SELECT * FROM uploaded_files ORDER BY created_at DESC",
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET: Download / View File
// GET: Download / View File
app.get("/api/download/:filename", async (req, res) => {
  const targetFile = req.params.filename;

  try {
    if (STORAGE_TYPE === "s3") {
      // 1. Prepare the S3 GetObjectCommand
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: targetFile,
      });

      // 2. Fetch the object stream from MinIO
      const response = await s3Client.send(command);

      // 3. Set proper headers for file download
      res.setHeader(
        "Content-Type",
        response.ContentType || "application/octet-stream",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${targetFile}"`,
      );

      // 4. Stream (pipe) the S3 body directly to the client
      return response.Body.pipe(res);
    }

    // 5. Local Block Storage Logic
    const filePath = path.join(uploadDir, targetFile);
    if (fs.existsSync(filePath)) {
      return res.download(filePath);
    } else {
      return res
        .status(404)
        .json({ error: "File not found on local storage." });
    }
  } catch (err) {
    console.error("Download Error:", err);
    // Note: If headers were already sent by .pipe(), we can't send a JSON error,
    // but this catch handles failures occurring BEFORE the pipe starts.
    if (!res.headersSent) {
      return res.status(500).json({ error: "Could not retrieve file." });
    }
  }
});

// DELETE: Reset all data (Wipes DB and Storage)
app.delete("/api/reset", async (req, res) => {
  try {
    // 1. Wipe the Database
    await dbClient.query("TRUNCATE TABLE uploaded_files RESTART IDENTITY");

    // 2. Wipe Storage
    if (STORAGE_TYPE === "local") {
      // Local Block Storage cleanup
      const files = await fs.promises.readdir(uploadDir);
      for (const file of files) {
        await fs.promises.unlink(path.join(uploadDir, file));
      }
    } else if (STORAGE_TYPE === "s3") {
      // MinIO / S3 Object Storage cleanup

      // Step A: List all objects in the bucket
      const listedObjects = await s3Client.send(
        new ListObjectsV2Command({ Bucket: bucketName }),
      );

      if (listedObjects.Contents) {
        // Step B: Delete them one by one
        for (const object of listedObjects.Contents) {
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: bucketName,
              Key: object.Key,
            }),
          );
        }
      }
    }

    res.json({ message: "System fully reset: Database and Storage wiped!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Reset failed: " + err.message });
  }
});

// --- 5. START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
