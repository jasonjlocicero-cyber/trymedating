function createImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", (e) => reject(e));
    img.crossOrigin = "anonymous";
    img.src = url;
  });
}

export async function getCroppedImageBlob(imageSrc, cropPixels, opts = {}) {
  const { mime = "image/jpeg", quality = 0.92, maxSize = 2048 } = opts;

  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported.");

  // Crop area
  const { width, height, x, y } = cropPixels;

  // Optional downscale cap (keeps uploads snappy on mobile)
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));

  canvas.width = outW;
  canvas.height = outH;

  // Draw cropped region scaled into output canvas
  ctx.drawImage(image, x, y, width, height, 0, 0, outW, outH);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Failed to create image blob."));
        resolve(blob);
      },
      mime,
      quality
    );
  });
}
