require("dotenv").config();
const express = require("express");
const { Server } = require("socket.io");
const cors = require("cors");
const http = require("http");
const app = express();
const fs = require("fs");
const { Readable } = require("stream");
const axios = require("axios");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const s3 = new S3Client({
  region: process.env.AWS_BUCKET_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const server = http.createServer(app);

app.use(cors());

// Socket Server
const io = new Server(server, {
  cors: {
    origin: process.env.ELECTRON_HOST,
    methods: ["GET", "POST"],
  },
});
let recordedChunks = [];
io.on("connection", (socket) => {
  console.log("🟢 Socket Is Connected");

  socket.on("video-chunks", async (data) => {
    const writestream = fs.createWriteStream("temp_upload/" + data.fileName);
    recordedChunks.push(data.chunks);
    const videoBlob = new Blob(recordedChunks, {
      type: "video/webm; codecs=vp9",
    });

    const buffer = Buffer.from(await videoBlob.arrayBuffer());
    const readStream = Readable.from(buffer);
    readStream.pipe(writestream).on("finish", () => {
      console.log("🟢 Chunk Saved");
    });
  });

  socket.on("process-video", (data) => {
    recordedChunks = [];

    fs.readFile("temp_upload/" + data.fileName, async (err, file) => {
      const processing = await axios.post(
        `${process.env.NEXT_API_HOST}recording/${data.userId}/processing`
      );

      if (processing.data.status !== 200)
        return console.log(
          "🔴 Error: Something went wrong with creating the processing file"
        );

      const Key = data.fileName;
      const Bucket = process.env.BUCKET_NAME;
      const ContentType = "video/webm";

      const command = new PutObjectCommand({
        Key,
        Bucket,
        ContentType,
        Body: file,
      });

      const fileStatus = await s3.send(command);
    });
  });

  socket.on("disconnect", () => {
    console.log("🟢 Socket is disconnected");
  });
});

server.listen(5000, () => {
  console.log("🟢 Listening to port 5000");
});
