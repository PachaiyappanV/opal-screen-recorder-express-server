require("dotenv").config();
const express = require("express");
const { Server } = require("socket.io");
const cors = require("cors");
const http = require("http");
const app = express();
const fs = require("fs");
const { Readable } = require("stream");

const server = http.createServer(app);

app.use(cors());

// Socket Server
const io = new Server(server, {
  cors: {
    origin: process.env.ELECTRON_HOST,
    methods: ["GET", "POST"],
  },
});
const recordedChunks = [];
io.on("connection", (socket) => {
  console.log("🟢 Socket Is Connected");

  socket.on("video-chunks", async (data) => {});

  socket.on("process-video", (data) => {});

  socket.on("disconnect", () => {
    console.log("🟢 Socket is disconnected");
  });
});

server.listen(5000, () => {
  console.log("🟢 Listening to port 5000");
});
