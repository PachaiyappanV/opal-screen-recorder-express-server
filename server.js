require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const fs = require("fs");
const multer = require("multer");
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
app.post("/upload", upload.single("video"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const fileName = req.file.originalname;
  const { userId } = req.body;
  console.log("🟢 File uploaded:", req);

  const audioPath = await extractAudioAndCompress(fileName);
  console.log("🟢 Audio Path:", audioPath);
  try {
    // upload video to s3
    fs.readFile("temp_video/" + fileName, async (err, file) => {
      const processing = await axios.post(
        `${process.env.NEXT_API_HOST}/recording/${userId}/processing`,
        { fileName }
      );

      if (processing.data.status !== 200)
        return console.log(
          "🔴 Error: Something went wrong with creating the processing file"
        );

      const Key = fileName;
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
          fs.stat(audioPath, async (err, stat) => {
            if (!err) {
              // Whisper 25MB limit
              if (stat.size < 25000000) {
                const transcription = await openai.audio.transcriptions.create({
                  file: fs.createReadStream(audioPath),
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
                  console.log("Transcription", transcription);
                  console.log("Content", completion.choices[0].message.content);
                  const titleAndSummaryGenerated = await axios.post(
                    `${process.env.NEXT_API_HOST}/recording/${userId}/transcribe`,
                    {
                      fileName,
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
          `${process.env.NEXT_API_HOST}/recording/${userId}/complete`,
          { fileName }
        );

        if (stopProcessing.data.status !== 200)
          console.log(
            "🔴 Error: Something went wrong when stopping the process and trying to complete the processing stage."
          );
      } else {
        console.log("🔴 Error: Something went wrong with uploading the video");
        return res.status(500).json({ error: "Something went wrong" });
      }
    });

    res.status(201).json({ message: "File uploaded successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Something went wrong" });
  } finally {
    fs.unlink(`temp_video/${fileName}`, (err) => {
      if (!err) console.log("🟢 Video Deleted");
    });

    fs.unlink(audioPath, (err) => {
      if (!err) console.log("🟢 Audio Deleted");
    });
  }
});
app.get("/", (req, res) => {
  res.send("Hello World!");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
