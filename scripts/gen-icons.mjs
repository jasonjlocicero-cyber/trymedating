// scripts/gen-icons.mjs
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = process.cwd();
const input = path.join(root, "public", "logo-mark.png");
const outDir = path.join(root, "public", "icons");

await fs.mkdir(outDir, { recursive: true });

// Base 1024
const base1024 = path.join(outDir, "icon-1024.png");
await sharp(input)
  .resize(1024, 1024, { fit: "contain", background: { r:0,g:0,b:0,alpha:0 } })
  .png().toFile(base1024);

// Standard PWA
await sharp(base1024).resize(512,512).toFile(path.join(outDir,"icon-512.png"));
await sharp(base1024).resize(192,192).toFile(path.join(outDir,"icon-192.png"));

// Maskable
const maskableBuf = await sharp(input)
  .resize(880,880,{ fit:"contain", background:{ r:0,g:0,b:0,alpha:0 } })
  .extend({ top:72,bottom:72,left:72,right:72, background:{ r:0,g:0,b:0,alpha:0 } })
  .png().toBuffer();
await fs.writeFile(path.join(outDir,"maskable-1024.png"), maskableBuf);
await sharp(maskableBuf).resize(512,512).toFile(path.join(outDir,"maskable-512.png"));
await sharp(maskableBuf).resize(192,192).toFile(path.join(outDir,"maskable-192.png"));

// Apple touch
await sharp(base1024).resize(180,180).toFile(path.join(outDir,"apple-touch-icon.png"));

// Favicons + .ico
const fav32 = path.join(root,"public","favicon-32.png");
const fav16 = path.join(root,"public","favicon-16.png");
await sharp(base1024).resize(32,32).png().toFile(fav32);
await sharp(base1024).resize(16,16).png().toFile(fav16);

const icoBuf = await pngToIco([fav16, fav32]);
await fs.writeFile(path.join(outDir,"icon.ico"), icoBuf);
await fs.writeFile(path.join(root,"public","favicon.ico"), icoBuf);

console.log("✅ Icons written to /public/icons and favicons to /public/");

