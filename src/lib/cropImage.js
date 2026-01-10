// src/lib/cropImage.js

function createImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", (e) => reject(e));
    img.crossOrigin = "anonymous";
    img.src = url;
  });
}

/**
 * Returns a Blob of the cropped image.
 * @param {string} imageSrc objectURL or URL
 * @param {{x:number,y:number,width:number,height:number}} pixelCrop
 * @param {{mimeType?:string, quality?:number}} options
 */
export async function getCroppedImageBlob(imageSrc, pixelCrop, options = {}) {
  const image = await createImage(imageSrc);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(pixelCrop.width));
  canvas.height = Math.max(1, Math.round(pixelCrop.height));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const mimeType = options.mimeType || "image/jpeg";
  const quality = typeof options.quality === "number" ? options.quality : 0.92;

  const blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), mimeType, quality)
  );

  if (!blob) throw new Error("Failed to crop image.");
  return blob;
}

export function blobToFile(blob, filename) {
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
}
