// scripts/gen-icons.mjs
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = process.cwd();

// Single source of truth
const input = path.join(root, "public", "logo-mark.png");
const outDir = path.join(root, "public", "icons");

// Offsets in *1024-space* (scaled down automatically for smaller sizes)
// Positive X moves RIGHT, negative moves LEFT
const OPTICAL_X_AT_1024 = Number(process.env.TMD_ICON_X ?? "-60");
const OPTICAL_Y_AT_1024 = Number(process.env.TMD_ICON_Y ?? "0");

async function safeUnlink(p) {
  try { await fs.unlink(p); } catch {}
}
async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

// Trim transparent edges, then resize "inner" and place into a square canvas
async function makePaddedSquareMaster(srcPath, size = 1024, inner = 860) {
  // Trim first so we’re centering the real pixels, not the original canvas
  const trimmed = await sharp(srcPath)
    .ensureAlpha()
    .trim({ threshold: 1 })
    .png()
    .toBuffer();

  const logo = await sharp(trimmed)
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

async function main() {
  await ensureDir(outDir);

  try {
    await fs.access(input);
  } catch {
    console.error(`❌ Missing input: ${input}`);
    process.exit(1);
  }

  console.log(`✅ Using offsets: TMD_ICON_X=${OPTICAL_X_AT_1024}, TMD_ICON_Y=${OPTICAL_Y_AT_1024}`);

  // Delete known generated outputs
  const generated = [
    path.join(outDir, "icon-1024.png"),
    path.join(outDir, "icon-512.png"),
    path.join(outDir, "icon-192.png"),
    path.join(outDir, "maskable-1024.png"),
    path.join(outDir, "maskable-512.png"),
    path.join(outDir, "maskable-192.png"),
    path.join(outDir, "apple-touch-icon.png"),
    path.join(outDir, "icon.ico"),
    path.join(outDir, "pwa-192.png"),
    path.join(outDir, "pwa-512.png"),
    path.join(root, "public", "favicon-32.png"),
    path.join(root, "public", "favicon-16.png"),
    path.join(root, "public", "favicon.ico"),
  ];
  for (const f of generated) await safeUnlink(f);

  // Standard icons
  const master1024 = await makePaddedSquareMaster(input, 1024, 860);
  await fs.writeFile(path.join(outDir, "icon-1024.png"), master1024);
  await sharp(master1024).resize(512, 512).png().toFile(path.join(outDir, "icon-512.png"));
  await sharp(master1024).resize(192, 192).png().toFile(path.join(outDir, "icon-192.png"));

  // Maskable icons (extra padding)
  const maskable1024 = await makePaddedSquareMaster(input, 1024, 780);
  await fs.writeFile(path.join(outDir, "maskable-1024.png"), maskable1024);
  await sharp(maskable1024).resize(512, 512).png().toFile(path.join(outDir, "maskable-512.png"));
  await sharp(maskable1024).resize(192, 192).png().toFile(path.join(outDir, "maskable-192.png"));

  // Aliases some manifests still reference
  await fs.copyFile(path.join(outDir, "icon-192.png"), path.join(outDir, "pwa-192.png"));
  await fs.copyFile(path.join(outDir, "icon-512.png"), path.join(outDir, "pwa-512.png"));

  // Apple touch icon
  await sharp(master1024).resize(180, 180).png().toFile(path.join(outDir, "apple-touch-icon.png"));

  // Favicons
  const fav32 = await sharp(master1024).resize(32, 32).png().toBuffer();
  const fav16 = await sharp(master1024).resize(16, 16).png().toBuffer();
  await fs.writeFile(path.join(root, "public", "favicon-32.png"), fav32);
  await fs.writeFile(path.join(root, "public", "favicon-16.png"), fav16);

  // Windows ICO
  const ico256 = await sharp(master1024).resize(256, 256).png().toBuffer();
  const ico128 = await sharp(master1024).resize(128, 128).png().toBuffer();
  const ico64  = await sharp(master1024).resize(64, 64).png().toBuffer();
  const ico48  = await sharp(master1024).resize(48, 48).png().toBuffer();
  const ico32  = await sharp(master1024).resize(32, 32).png().toBuffer();
  const ico16  = await sharp(master1024).resize(16, 16).png().toBuffer();

  const ico = await pngToIco([ico16, ico32, ico48, ico64, ico128, ico256]);
  await fs.writeFile(path.join(root, "public", "favicon.ico"), ico);
  await fs.writeFile(path.join(outDir, "icon.ico"), ico);

  console.log("✅ Icons generated (trimmed, centered, offsets applied).");
}

main().catch((err) => {
  console.error("❌ gen-icons failed:", err);
  process.exit(1);
});






