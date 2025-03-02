const ffmpeg = require("fluent-ffmpeg");

const extractAudioAndCompress = (fileName) => {
  return new Promise((resolve, reject) => {
    const inputVideo = `temp_video/${fileName}`;
    const finalAudio = `temp_audio/${fileName}.mp3`;

    ffmpeg(inputVideo)
      .output(finalAudio)
      .noVideo()
      .audioBitrate("64k") // Compress audio
      .on("end", () => {
        console.log("🟢 Audio extracted and compressed successfully!");
        resolve(finalAudio); // Resolve with output file path
      })
      .on("error", (err) => {
        console.log("🔴 Error:", err);
        reject(err);
      })
      .run();
  });
};

module.exports = {
  extractAudioAndCompress,
};
