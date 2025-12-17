// scripts/gen-icons.mjs
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { encode } from "icojs";

const root = process.cwd();

// IMPORTANT: source image should be the MARK ONLY (no text)
const input = path.join(root, "public", "logo-mark.png");
const outDir = path.join(root, "public", "icons");

await fs.mkdir(outDir, { recursive: true });

// Optical centering tweak (negative X moves LEFT)
const OPTICAL_X_AT_1024 = 0;
const OPTICAL_Y_AT_1024 = 0;

async function makePaddedSquareMaster(srcPath, size = 1024, inner = 860) {
  const logo = await sharp(srcPath)
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const pad = Math.floor((size - inner) / 2);

  const scale = size / 1024;
  const opticalX = Math.round(OPTICAL_X_AT_1024 * scale);
  const opticalY = Math.round(OPTICAL_Y_AT_1024 * scale);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: logo, left: pad + opticalX, top: pad + opticalY }])
    .png()
    .toBuffer();
}

const master1024 = await makePaddedSquareMaster(input, 1024, 860);
await fs.writeFile(path.join(outDir, "icon-1024.png"), master1024);

// Standard PWA icons
await sharp(master1024).resize(512, 512).png().toFile(path.join(outDir, "icon-512.png"));
await sharp(master1024).resize(192, 192).png().toFile(path.join(outDir, "icon-192.png"));

// Maskable set (extra safe padding)
const maskable1024 = await makePaddedSquareMaster(input, 1024, 780);
await fs.writeFile(path.join(outDir, "maskable-1024.png"), maskable1024);
await sharp(maskable1024).resize(512, 512).png().toFile(path.join(outDir, "maskable-512.png"));
await sharp(maskable1024).resize(192, 192).png().toFile(path.join(outDir, "maskable-192.png"));

// Apple touch icon
await sharp(master1024).resize(180, 180).png().toFile(path.join(outDir, "apple-touch-icon.png"));

// Favicons PNG
const fav32 = await sharp(master1024).resize(32, 32).png().toBuffer();
const fav16 = await sharp(master1024).resize(16, 16).png().toBuffer();
await fs.writeFile(path.join(root, "public", "favicon-32.png"), fav32);
await fs.writeFile(path.join(root, "public", "favicon-16.png"), fav16);

// Windows ICO using icojs (guarantees 256x256 frame)
async function rawRGBA(pngBuffer, size) {
  const { data, info } = await sharp(pngBuffer)
    .resize(size, size)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return { width: info.width, height: info.height, data };
}

const sizes = [16, 32, 48, 64, 128, 256];
const images = [];
for (const s of sizes) images.push(await rawRGBA(master1024, s));

const icoArrayBuffer = await encode(images);
const icoBuf = Buffer.from(icoArrayBuffer);

await fs.writeFile(path.join(outDir, "icon.ico"), icoBuf);
await fs.writeFile(path.join(root, "public", "favicon.ico"), icoBuf);

console.log("✅ Icons generated (including 256x256 ICO).");


console.log("✅ Icons written to /public/icons and favicons to /public/");
