// video.js
const { createCanvas } = require("canvas");
const { spawn } = require("child_process");
const path = require("path");

async function createVideo({
    width = 1280,
    height = 720,
    fps = 24,
    totalFrames,
    output = "output.mp4",
    renderFrame,
    onProgress
}) {
    if (typeof renderFrame !== "function") {
        throw new Error("renderFrame must be a function");
    }

    const outputPath = path.isAbsolute(output)
        ? output
        : path.join(process.cwd(), output);

    const ffmpeg = spawn("ffmpeg", [
        "-y",
        "-f", "image2pipe",
        "-framerate", String(fps),
        "-i", "-",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
        outputPath
    ]);

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    for (let frame = 0; frame < totalFrames; frame++) {
        await renderFrame({
            frame,
            ctx,
            canvas,
            width,
            height
        });

        ffmpeg.stdin.write(
            canvas.toBuffer("image/jpeg")
        );

        if (onProgress) {
            await onProgress(frame + 1, totalFrames);
        }
    }

    ffmpeg.stdin.end();

    await new Promise((resolve, reject) => {
        ffmpeg.on("close", resolve);
        ffmpeg.on("error", reject);
    });

    return outputPath;
}

module.exports = {
    createVideo
};