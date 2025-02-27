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
const { extractAudioAndCompress } = require("./utils");
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    const writestream = fs.createWriteStream("temp_video/" + data.fileName);
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
    extractAudioAndCompress(data.fileName);
    recordedChunks = [];

    // upload video to s3
    fs.readFile("temp_video/" + data.fileName, async (err, file) => {
      const processing = await axios.post(
        `${process.env.NEXT_API_HOST}/recording/${data.userId}/processing`,
        { fileName: data.fileName }
      );

      if (processing.data.status !== 200)
        return console.log(
          "🔴 Error: Something went wrong with creating the processing file"
        );

      const Key = data.fileName;
      const Bucket = process.env.AWS_BUCKET_NAME;
      const ContentType = "video/webm";

      const command = new PutObjectCommand({
        Key,
        Bucket,
        ContentType,
        Body: file,
      });

      const fileStatus = await s3.send(command);

      if (fileStatus["$metadata"].httpStatusCode === 200) {
        console.log("🟢 Video Uploaded To AWS");

        if (processing.data.plan === "PRO") {
          fs.stat(`temp_audio/${data.fileName}.mp3`, async (err, stat) => {
            if (!err) {
              // Whisper 25MB limit
              if (stat.size < 25000000) {
                const transcription = await openai.audio.transcriptions.create({
                  file: fs.createReadStream(`temp_audio/${data.fileName}.mp3`),
                  model: "whisper-1",
                  response_format: "text",
                });

                if (transcription) {
                  const completion = await openai.chat.completions.create({
                    model: "gpt-3.5-turbo",
                    response_format: { type: "json_object" },
                    temperature: 0.7,
                    messages: [
                      {
                        role: "system",
                        content: `You are going to generate a title and a nice description using the speech-to-text transcription provided: transcription(${transcription}) and then return it in JSON format as {"title": <the title you gave>, "summary": <the summary you created>}`,
                      },
                    ],
                  });

                  const titleAndSummaryGenerated = await axios.post(
                    `${process.env.NEXT_API_HOST}/recording/${data.userId}/transcribe`,
                    {
                      fileName: data.fileName,
                      content: completion.choices[0].message.content,
                      transcription: transcription,
                    }
                  );

                  if (titleAndSummaryGenerated.data.status !== 200) {
                    console.log(
                      "🔴 Error: Something went wrong with creating the title and summary file"
                    );
                  }
                }
              }
            }
          });
        }

        const stopProcessing = await axios.post(
          `${process.env.NEXT_API_HOST}/recording/${data.userId}/complete`,
          { fileName: data.fileName }
        );

        if (stopProcessing.data.status !== 200)
          console.log(
            "🔴 Error: Something went wrong when stopping the process and trying to complete the processing stage."
          );

        if (stopProcessing.status === 200) {
          fs.unlink(`temp_video/${data.fileName}`, (err) => {
            if (!err) console.log("🟢 Video Deleted");
          });

          fs.unlink(`temp_audio/${data.fileName}.mp3`, (err) => {
            if (!err) console.log("🟢 Audio Deleted");
          });
        }
      } else {
        console.log("🔴 Error: Something went wrong with uploading the video");
      }
    });
  });

  socket.on("disconnect", () => {
    console.log("🟢 Socket is disconnected");
  });
});

server.listen(5000, () => {
  console.log("🟢 Listening to port 5000");
});
