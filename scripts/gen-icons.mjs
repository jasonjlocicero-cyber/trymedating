// scripts/gen-icons.mjs
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import toIco from "to-ico";

const root = process.cwd();
const input = path.join(root, "public", "logo-mark.png");
const outDir = path.join(root, "public", "icons");

await fs.mkdir(outDir, { recursive: true });

// Base 1024x1024 square (transparent padding if needed)
await sharp(input)
  .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(outDir, "icon-1024.png"));

// Standard PWA icons
await sharp(path.join(outDir, "icon-1024.png")).resize(512, 512).toFile(path.join(outDir, "icon-512.png"));
await sharp(path.join(outDir, "icon-1024.png")).resize(192, 192).toFile(path.join(outDir, "icon-192.png"));

// Maskable (extra padding: inner 880 inside 1024 canvas)
const maskable1024 = await sharp(input)
  .resize(880, 880, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({ top: 72, bottom: 72, left: 72, right: 72, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
await fs.writeFile(path.join(outDir, "maskable-1024.png"), maskable1024);
await sharp(maskable1024).resize(512, 512).toFile(path.join(outDir, "maskable-512.png"));
await sharp(maskable1024).resize(192, 192).toFile(path.join(outDir, "maskable-192.png"));

// Apple touch icon
await sharp(path.join(outDir, "icon-1024.png")).resize(180, 180).toFile(path.join(outDir, "apple-touch-icon.png"));

// Favicons (16, 32 and .ico)
const fav32 = await sharp(path.join(outDir, "icon-1024.png")).resize(32, 32).png().toBuffer();
const fav16 = await sharp(path.join(outDir, "icon-1024.png")).resize(16, 16).png().toBuffer();
await fs.writeFile(path.join(root, "public", "favicon-32.png"), fav32);
await fs.writeFile(path.join(root, "public", "favicon-16.png"), fav16);
const ico = await toIco([fav16, fav32]);
await fs.writeFile(path.join(root, "public", "favicon.ico"), ico);

console.log("✅ Icons written to /public/icons and favicons to /public/");
