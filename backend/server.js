const express = require('express');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const multer = require('multer');

const app = express();
app.use(express.json());

const greetingMessage = process.env.GREETING_TEXT || 'Hello from Node! (No Env Var Set)';

// --- 1. DATABASE SETUP ---
// Using fallbacks ('||') so it works locally on Windows WITHOUT Docker too!
const dbClient = new Client({
  host: process.env.DB_HOST || 'localhost', 
  user: process.env.DB_USER || 'demo_user',
  password: process.env.DB_PASSWORD || 'super_secret_demo_password',
  database: process.env.DB_NAME || 'demo_db',
  port: process.env.DB_PORT || 5432,
});

let dbStatus = 'Connecting...';

dbClient.connect()
  .then(async () => {
    dbStatus = 'Connected successfully to Postgres!';
    
    // Auto-create the table if it doesn't exist
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS uploaded_files (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Database table 'uploaded_files' is ready.");
  })
  .catch(err => {
      dbStatus = 'Failed to connect to Postgres: ' + err.message;
      console.log(dbStatus);
  });

// --- 2. FILE SYSTEM & MULTER SETUP ---
// Using path.join makes this work on Windows (C:\) and Linux (/app/)
const uploadDir = path.join(__dirname, 'uploads');

// recursive: true prevents crashing if the folder already exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true }); 
}

// Configure multer to keep original file names
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadDir) },
  filename: function (req, file, cb) { cb(null, file.originalname) }
});

// Declare the upload middleware BEFORE the routes
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit to prevent crashes
});


// --- 3. API ROUTES ---

// GET: Server Status
app.get('/api/greeting', (req, res) => {
    res.json({ message: greetingMessage, db_status: dbStatus });
});

// POST: Upload File (Saves to disk AND saves record to Postgres)
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    
    try {
        await dbClient.query('INSERT INTO uploaded_files (filename) VALUES ($1)', [req.file.originalname]);
        res.json({ status: 'File uploaded to disk AND recorded in Database!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: List Files (Pulls records from Postgres, NOT the file system)
app.get('/api/files', async (req, res) => {
    try {
        const result = await dbClient.query('SELECT * FROM uploaded_files ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: Download File (The "Broken Link" Trap)
app.get('/api/download/:filename', (req, res) => {
    // path.join safely builds the URL whether on Windows or Linux
    const filePath = path.join(uploadDir, req.params.filename);
    
    // Check if the file actually exists on the hard drive
    if (fs.existsSync(filePath)) {
        res.download(filePath); // Success!
    } else {
        // The DB remembered the file, but the storage lost it!
        res.status(404).json({ error: 'FILE NOT FOUND IN STORAGE. Ephemeral data was lost!' });
    }
});


// DELETE: Reset all data (Wipes DB and Container Storage)
app.delete('/api/reset', async (req, res) => {
    try {
        // 1. Wipe the Database and reset the Serial IDs back to 1
        await dbClient.query('TRUNCATE TABLE uploaded_files RESTART IDENTITY');
        
        // 2. Wipe the Container File System
        const fsPromises = fs.promises;
        const files = await fsPromises.readdir(uploadDir);
        for (const file of files) {
            await fsPromises.unlink(path.join(uploadDir, file));
        }
        
        res.json({ message: 'All data completely wiped!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 4. START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));