// scripts/gen-icons.mjs
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = process.cwd();

// Try a few common logo locations so this script is robust to repo tweaks
const candidateInputs = [
  path.join(root, "public", "logo-mark.png"),
  path.join(root, "public", "icons", "TryMeDating Logo.png"),
  path.join(root, "public", "icons", "icon-1024.png"),
  path.join(root, "public", "icons", "icon-512.png")
];

async function resolveInput() {
  for (const p of candidateInputs) {
    try {
      await fs.access(p);
      return p;
    } catch (_) {}
  }
  throw new Error(
    `No input logo found. Expected one of:\n${candidateInputs
      .map((p) => `  - ${path.relative(root, p)}`)
      .join("\n")}`
  );
}

const outDir = path.join(root, "public", "icons");
await fs.mkdir(outDir, { recursive: true });

const input = await resolveInput();

// ---------- Base 1024x1024 square (transparent padding if needed)
const icon1024Path = path.join(outDir, "icon-1024.png");
await sharp(input)
  .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(icon1024Path);

// ---------- Standard PWA icons
await sharp(icon1024Path).resize(512, 512).toFile(path.join(outDir, "icon-512.png"));
await sharp(icon1024Path).resize(192, 192).toFile(path.join(outDir, "icon-192.png"));

// ---------- Maskable (extra padding so the graphic sits safely inside the mask)
const maskable1024 = await sharp(input)
  .resize(880, 880, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({ top: 72, bottom: 72, left: 72, right: 72, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

await fs.writeFile(path.join(outDir, "maskable-1024.png"), maskable1024);
await sharp(maskable1024).resize(512, 512).toFile(path.join(outDir, "maskable-512.png"));
await sharp(maskable1024).resize(192, 192).toFile(path.join(outDir, "maskable-192.png"));

// ---------- Apple touch icon
await sharp(icon1024Path).resize(180, 180).toFile(path.join(outDir, "apple-touch-icon.png"));

// ---------- Favicons (16, 32) + favicon.ico via png-to-ico
const fav32 = await sharp(icon1024Path).resize(32, 32).png().toBuffer();
const fav16 = await sharp(icon1024Path).resize(16, 16).png().toBuffer();
await fs.writeFile(path.join(root, "public", "favicon-32.png"), fav32);
await fs.writeFile(path.join(root, "public", "favicon-16.png"), fav16);

const faviconIco = await pngToIco([fav16, fav32]);
await fs.writeFile(path.join(root, "public", "favicon.ico"), faviconIco);

// ---------- Windows app icon.ico (multi-size) for electron-builder
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoPngs = await Promise.all(
  icoSizes.map((sz) => sharp(icon1024Path).resize(sz, sz).png().toBuffer())
);
const appIco = await pngToIco(icoPngs);
await fs.writeFile(path.join(outDir, "icon.ico"), appIco);

console.log("✅ Icons written to /public/icons and favicons to /public/");

