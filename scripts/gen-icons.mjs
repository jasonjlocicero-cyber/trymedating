// scripts/gen-icons.mjs
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = process.cwd();

// ✅ Use the NO-TEXT mark (this is the one you want on the desktop icon)
const input = path.join(root, "public", "logo-mark.png");
const outDir = path.join(root, "public", "icons");

await fs.mkdir(outDir, { recursive: true });

// Optical centering tweak:
// Negative X moves the logo LEFT, positive moves RIGHT.
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

  // Scale optical offsets with size
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
    .composite([
      {
        input: logo,
        left: pad + opticalX,
        top: pad + opticalY,
      },
    ])
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
await sharp(master1024).resize(32, 32).png().toFile(path.join(root, "public", "favicon-32.png"));
await sharp(master1024).resize(16, 16).png().toFile(path.join(root, "public", "favicon-16.png"));

// ✅ Windows ICO (must include 256x256 frame)
const ico256 = await sharp(master1024).resize(256, 256).png().toBuffer();
const ico128 = await sharp(master1024).resize(128, 128).png().toBuffer();
const ico64  = await sharp(master1024).resize(64, 64).png().toBuffer();
const ico48  = await sharp(master1024).resize(48, 48).png().toBuffer();
const ico32  = await sharp(master1024).resize(32, 32).png().toBuffer();
const ico16  = await sharp(master1024).resize(16, 16).png().toBuffer();

// IMPORTANT: include 256 first so it’s definitely present
const ico = await pngToIco([ico256, ico128, ico64, ico48, ico32, ico16]);

await fs.writeFile(path.join(outDir, "icon.ico"), ico);
await fs.writeFile(path.join(root, "public", "favicon.ico"), ico);

console.log("✅ Icons written to /public/icons and favicons to /public/");




