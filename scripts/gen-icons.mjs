// scripts/gen-icons.mjs
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = process.cwd();
const input = path.join(root, "public", "logo-mark.png");

// We generate into: /public/icons
const outDir = path.join(root, "public", "icons");
await fs.mkdir(outDir, { recursive: true });

// Optical centering tweak (negative = move LEFT)
const OPTICAL_X_AT_1024 = -16; // adjust later if needed
const OPTICAL_Y_AT_1024 = 0;

async function makeMaster(size = 1024, inner = 860) {
  const logo = await sharp(input)
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

// 1) 1024 master
const master1024 = await makeMaster(1024, 860);
await fs.writeFile(path.join(outDir, "icon-1024.png"), master1024);

// 2) Standard PWA icons
await sharp(master1024).resize(512, 512).png().toFile(path.join(outDir, "icon-512.png"));
await sharp(master1024).resize(192, 192).png().toFile(path.join(outDir, "icon-192.png"));

// 3) Maskable (more padding)
const maskable1024 = await makeMaster(1024, 780);
await fs.writeFile(path.join(outDir, "maskable-1024.png"), maskable1024);
await sharp(maskable1024).resize(512, 512).png().toFile(path.join(outDir, "maskable-512.png"));
await sharp(maskable1024).resize(192, 192).png().toFile(path.join(outDir, "maskable-192.png"));

// 4) Apple touch
await sharp(master1024).resize(180, 180).png().toFile(path.join(outDir, "apple-touch-icon.png"));

// 5) Favicons PNG
await fs.writeFile(path.join(root, "public", "favicon-32.png"), await sharp(master1024).resize(32, 32).png().toBuffer());
await fs.writeFile(path.join(root, "public", "favicon-16.png"), await sharp(master1024).resize(16, 16).png().toBuffer());

// 6) Windows ICO (MUST include 256x256)
const ico256 = await sharp(master1024).resize(256, 256).png().toBuffer();
const ico128 = await sharp(master1024).resize(128, 128).png().toBuffer();
const ico64  = await sharp(master1024).resize(64, 64).png().toBuffer();
const ico48  = await sharp(master1024).resize(48, 48).png().toBuffer();
const ico32  = await sharp(master1024).resize(32, 32).png().toBuffer();
const ico16  = await sharp(master1024).resize(16, 16).png().toBuffer();

const ico = await pngToIco([ico16, ico32, ico48, ico64, ico128, ico256]);

await fs.writeFile(path.join(outDir, "icon.ico"), ico);
await fs.writeFile(path.join(root, "public", "favicon.ico"), ico);

console.log("✅ Icons generated:");
console.log("   public/icons/icon.ico");
console.log("   public/icons/icon-512.png, icon-192.png, apple-touch-icon.png, maskable-*");
console.log("   public/favicon.ico, favicon-16.png, favicon-32.png");

