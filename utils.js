const ffmpeg = require("fluent-ffmpeg");
const extractAudioAndCompress = (fileName) => {
  const inputVideo = `temp_video/${fileName}`;
  const finalAudio = `temp_audio/${fileName}.mp3`;

  ffmpeg(inputVideo)
    .output(finalAudio)
    .noVideo()
    .audioBitrate("64k") // Compress audio
    .on("end", () => {
      console.log("Audio extracted and compressed successfully!");
    })
    .on("error", (err) => {
      console.error("Error:", err);
    })
    .run();
};

module.exports = {
  extractAudioAndCompress,
};
