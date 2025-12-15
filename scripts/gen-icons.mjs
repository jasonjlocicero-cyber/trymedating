// scripts/gen-icons.mjs
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = process.cwd();
const input = path.join(root, "public", "logo-mark.png");
const outDir = path.join(root, "public", "icons");

await fs.mkdir(outDir, { recursive: true });

// Helper: create a padded square master so the logo sits centered and doesn't look "top-left heavy"
async function makePaddedSquareMaster(srcPath, size = 1024, inner = 860) {
  // inner is the "logo box" inside the square canvas. Smaller = more padding.
  const logo = await sharp(srcPath)
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const pad = Math.floor((size - inner) / 2);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: logo, left: pad, top: pad }])
    .png()
    .toBuffer();
}

// 1) Create a centered/padded 1024 master
const master1024 = await makePaddedSquareMaster(input, 1024, 860);
await fs.writeFile(path.join(outDir, "icon-1024.png"), master1024);

// 2) Standard PWA icons
await sharp(master1024).resize(512, 512).png().toFile(path.join(outDir, "icon-512.png"));
await sharp(master1024).resize(192, 192).png().toFile(path.join(outDir, "icon-192.png"));

// 3) Maskable set (give a little extra safe padding)
const maskable1024 = await makePaddedSquareMaster(input, 1024, 780);
await fs.writeFile(path.join(outDir, "maskable-1024.png"), maskable1024);
await sharp(maskable1024).resize(512, 512).png().toFile(path.join(outDir, "maskable-512.png"));
await sharp(maskable1024).resize(192, 192).png().toFile(path.join(outDir, "maskable-192.png"));

// 4) Apple touch icon
await sharp(master1024).resize(180, 180).png().toFile(path.join(outDir, "apple-touch-icon.png"));

// 5) Favicons PNG
const fav32 = await sharp(master1024).resize(32, 32).png().toBuffer();
const fav16 = await sharp(master1024).resize(16, 16).png().toBuffer();
await fs.writeFile(path.join(root, "public", "favicon-32.png"), fav32);
await fs.writeFile(path.join(root, "public", "favicon-16.png"), fav16);

// 6) Windows ICO (IMPORTANT: include 256/128/64/48/32/16 frames)
const ico256 = await sharp(master1024).resize(256, 256).png().toBuffer();
const ico128 = await sharp(master1024).resize(128, 128).png().toBuffer();
const ico64  = await sharp(master1024).resize(64, 64).png().toBuffer();
const ico48  = await sharp(master1024).resize(48, 48).png().toBuffer();
const ico32b = await sharp(master1024).resize(32, 32).png().toBuffer();
const ico16b = await sharp(master1024).resize(16, 16).png().toBuffer();

const ico = await pngToIco([ico16b, ico32b, ico48, ico64, ico128, ico256]);

// Write BOTH locations so Electron + your build config can reference it
await fs.writeFile(path.join(outDir, "icon.ico"), ico);
await fs.writeFile(path.join(root, "public", "favicon.ico"), ico);

console.log("✅ Icons generated:");
console.log("   - public/icons/icon-1024.png (+ 512/192)");
console.log("   - public/icons/maskable-*.png");
console.log("   - public/icons/apple-touch-icon.png");
console.log("   - public/icons/icon.ico (Windows)");
console.log("   - public/favicon.ico, favicon-16.png, favicon-32.png");
