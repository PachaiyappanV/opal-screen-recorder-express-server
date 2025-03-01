require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const fs = require("fs");
const multer = require("multer");

if (!fs.existsSync("temp_video")) {
  fs.mkdirSync("temp_video");
}
if (!fs.existsSync("temp_audio")) {
  fs.mkdirSync("temp_audio");
}
// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "temp_video"); // Save files inside the "temp_video" directory
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname); // Keep the original filename
  },
});
const upload = multer({ storage });

app.use(cors());

// API route to handle file upload
app.post("/upload", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  console.log(req.file.filename);

  res.status(201).json({ message: "File uploaded successfully" });
});
app.get("/", (req, res) => {
  res.send("Hello World!");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
