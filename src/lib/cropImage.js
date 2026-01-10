// src/lib/cropImage.js

function createImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", (err) => reject(err));
    img.crossOrigin = "anonymous";
    img.src = url;
  });
}

function getRadianAngle(degreeValue) {
  return (degreeValue * Math.PI) / 180;
}

/**
 * Returns a Blob of the cropped image.
 * @param {string} imageSrc - objectURL or dataURL
 * @param {{x:number,y:number,width:number,height:number}} pixelCrop
 * @param {number} rotation - degrees
 * @param {string} outputType - "image/jpeg" | "image/png" | "image/webp"
 * @param {number} quality - jpeg/webp quality 0..1
 */
export async function getCroppedBlob(
  imageSrc,
  pixelCrop,
  rotation = 0,
  outputType = "image/jpeg",
  quality = 0.92
) {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context.");

  const rotRad = getRadianAngle(rotation);

  // Calculate bounding box of the rotated image
  const sin = Math.abs(Math.sin(rotRad));
  const cos = Math.abs(Math.cos(rotRad));
  const bBoxWidth = Math.floor(image.width * cos + image.height * sin);
  const bBoxHeight = Math.floor(image.width * sin + image.height * cos);

  // Draw rotated image to a temp canvas
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = bBoxWidth;
  tempCanvas.height = bBoxHeight;
  const tctx = tempCanvas.getContext("2d");
  if (!tctx) throw new Error("Could not create temp canvas context.");

  tctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  tctx.rotate(rotRad);
  tctx.translate(-image.width / 2, -image.height / 2);
  tctx.drawImage(image, 0, 0);

  // Now crop from the temp canvas into final canvas
  canvas.width = Math.max(1, Math.floor(pixelCrop.width));
  canvas.height = Math.max(1, Math.floor(pixelCrop.height));

  ctx.drawImage(
    tempCanvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return new Promise((resolve, reject) => {
    const useQuality = outputType === "image/jpeg" || outputType === "image/webp";
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas is empty / failed to export."));
          return;
        }
        resolve(blob);
      },
      outputType,
      useQuality ? quality : undefined
    );
  });
}

