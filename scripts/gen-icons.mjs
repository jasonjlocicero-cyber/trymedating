// scripts/gen-icons.mjs
// IMPORTANT:
// - public/logo-mark.png is the ONLY source asset (heart-only recommended)
// - All icons are generated — do NOT hand-edit files in public/icons
// - Run `npm run gen:icons` after changing the logo

import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = process.cwd();

// ✅ SINGLE SOURCE OF TRUTH
const input = path.join(root, "public", "logo-mark.png");

// Output folder
const outDir = path.join(root, "public", "icons");

// Optional manual nudge (in 1024-scale pixels). Usually leave at 0.
// You can override without editing the file:
//   $env:TMD_ICON_X = "40"; $env:TMD_ICON_Y = "0"; npm run gen:icons
const EXTRA_X_AT_1024 = parseInt(process.env.TMD_ICON_X || "0", 10);
const EXTRA_Y_AT_1024 = parseInt(process.env.TMD_ICON_Y || "0", 10);

async function safeUnlink(p) {
  try { await fs.unlink(p); } catch { /* ignore */ }
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

function computeAlphaCentroidShift(raw, w, h) {
  // raw is RGBA
  let sumA = 0;
  let sumX = 0;
  let sumY = 0;

  // Iterate pixels (alpha-weighted)
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const a = raw[row + x * 4 + 3]; // 0..255
      if (!a) continue;
      sumA += a;
      sumX += x * a;
      sumY += y * a;
    }
  }

  if (sumA === 0) return { dx: 0, dy: 0 };

  const cx = sumX / sumA;
  const cy = sumY / sumA;

  const midX = (w - 1) / 2;
  const midY = (h - 1) / 2;

  // dx/dy to move centroid to center
  const dx = Math.round(midX - cx);
  const dy = Math.round(midY - cy);

  return { dx, dy };
}

async function makeCenteredInnerPng(srcPath, inner, label) {
  // 1) Trim transparent edges, resize to "inner", keep alpha
  const { data, info } = await sharp(srcPath)
    .ensureAlpha()
    .trim() // trims based on corner pixel (works well when corners are transparent)
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;

  // 2) Compute optical/centroid shift
  const { dx, dy } = computeAlphaCentroidShift(data, w, h);

  // 3) Add optional manual nudge (scaled to current inner size)
  const extraX = Math.round((EXTRA_X_AT_1024 * inner) / 1024);
  const extraY = Math.round((EXTRA_Y_AT_1024 * inner) / 1024);

  const finalX = dx + extraX;
  const finalY = dy + extraY;

  console.log(
    `🧭 ${label}: centroid shift dx=${dx}, dy=${dy} | extra dx=${extraX}, dy=${extraY} | final dx=${finalX}, dy=${finalY}`
  );

  // 4) Re-compose into same-size inner canvas with the shift applied
  const centered = await sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: data,
        raw: { width: w, height: h, channels: 4 },
        left: finalX,
        top: finalY,
      },
    ])
    .png()
    .toBuffer();

  return centered;
}

async function makeSquare(size, innerPng, inner) {
  const pad = Math.floor((size - inner) / 2);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: innerPng, left: pad, top: pad }])
    .png()
    .toBuffer();
}

async function main() {
  await ensureDir(outDir);

  // Guard: ensure input exists
  try {
    await fs.access(input);
  } catch {
    console.error(`❌ Missing input: ${input}`);
    process.exit(1);
  }

  // Delete generated outputs (prevents stale results)
  const generated = [
    path.join(outDir, "icon-1024.png"),
    path.join(outDir, "icon-512.png"),
    path.join(outDir, "icon-192.png"),
    path.join(outDir, "maskable-1024.png"),
    path.join(outDir, "maskable-512.png"),
    path.join(outDir, "maskable-192.png"),
    path.join(outDir, "apple-touch-icon.png"),
    path.join(outDir, "pwa-192.png"),
    path.join(outDir, "pwa-512.png"),
    path.join(outDir, "icon.ico"),
    path.join(root, "public", "favicon-32.png"),
    path.join(root, "public", "favicon-16.png"),
    path.join(root, "public", "favicon.ico"),
  ];
  for (const f of generated) await safeUnlink(f);

  // ---- Standard icon set (nice padding) ----
  const INNER_STD = 860; // padding for normal icons
  const innerStdPng = await makeCenteredInnerPng(input, INNER_STD, "STD(inner=860)");
  const master1024 = await makeSquare(1024, innerStdPng, INNER_STD);
  await fs.writeFile(path.join(outDir, "icon-1024.png"), master1024);
  await sharp(master1024).resize(512, 512).png().toFile(path.join(outDir, "icon-512.png"));
  await sharp(master1024).resize(192, 192).png().toFile(path.join(outDir, "icon-192.png"));

  // ---- Maskable set (extra safe padding) ----
  const INNER_MASK = 780; // more padding so Android launchers don't clip
  const innerMaskPng = await makeCenteredInnerPng(input, INNER_MASK, "MASK(inner=780)");
  const maskable1024 = await makeSquare(1024, innerMaskPng, INNER_MASK);
  await fs.writeFile(path.join(outDir, "maskable-1024.png"), maskable1024);
  await sharp(maskable1024).resize(512, 512).png().toFile(path.join(outDir, "maskable-512.png"));
  await sharp(maskable1024).resize(192, 192).png().toFile(path.join(outDir, "maskable-192.png"));

  // ---- Apple touch icon ----
  await sharp(master1024).resize(180, 180).png().toFile(path.join(outDir, "apple-touch-icon.png"));

  // ---- PWA aliases (if manifest references pwa-192/pwa-512) ----
  await fs.copyFile(path.join(outDir, "icon-192.png"), path.join(outDir, "pwa-192.png"));
  await fs.copyFile(path.join(outDir, "icon-512.png"), path.join(outDir, "pwa-512.png"));

  // ---- Favicons (root) ----
  const fav32 = await sharp(master1024).resize(32, 32).png().toBuffer();
  const fav16 = await sharp(master1024).resize(16, 16).png().toBuffer();
  await fs.writeFile(path.join(root, "public", "favicon-32.png"), fav32);
  await fs.writeFile(path.join(root, "public", "favicon-16.png"), fav16);

  // ---- Windows ICO (include 256 frame) ----
  const ico256 = await sharp(master1024).resize(256, 256).png().toBuffer();
  const ico128 = await sharp(master1024).resize(128, 128).png().toBuffer();
  const ico64  = await sharp(master1024).resize(64, 64).png().toBuffer();
  const ico48  = await sharp(master1024).resize(48, 48).png().toBuffer();
  const ico32  = await sharp(master1024).resize(32, 32).png().toBuffer();
  const ico16  = await sharp(master1024).resize(16, 16).png().toBuffer();

  const ico = await pngToIco([ico16, ico32, ico48, ico64, ico128, ico256]);
  await fs.writeFile(path.join(root, "public", "favicon.ico"), ico);
  await fs.writeFile(path.join(outDir, "icon.ico"), ico);

  console.log("✅ Icons generated from public/logo-mark.png (auto-trimmed + centroid-centered).");
  console.log("✅ Generated public/icons/icon.ico with 256x256 included.");
}

main().catch((err) => {
  console.error("❌ gen-icons failed:", err);
  process.exit(1);
});





