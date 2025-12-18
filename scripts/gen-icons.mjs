// scripts/gen-icons.mjs
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = process.cwd();
const input = path.join(root, "public", "logo-mark.png");
const outDir = path.join(root, "public", "icons");

await fs.mkdir(outDir, { recursive: true });

// Negative X moves LEFT, positive moves RIGHT
const OPTICAL_X_AT_1024 = 0;
const OPTICAL_Y_AT_1024 = 0;

async function makeMasterPng(size = 1024, inner = 860) {
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
    .composite([{ input: logo, left: pad + opticalX, top: pad + opticalY }])
    .png()
    .toBuffer();
}

(async () => {
  // Master icon
  const master1024 = await makeMasterPng(1024, 860);
  await fs.writeFile(path.join(outDir, "icon-1024.png"), master1024);

  // Common PNGs
  await sharp(master1024).resize(512, 512).png().toFile(path.join(outDir, "icon-512.png"));
  await sharp(master1024).resize(256, 256).png().toFile(path.join(outDir, "icon-256.png"));
  await sharp(master1024).resize(192, 192).png().toFile(path.join(outDir, "icon-192.png"));

  // Maskable
  const maskable1024 = await makeMasterPng(1024, 780);
  await fs.writeFile(path.join(outDir, "maskable-1024.png"), maskable1024);
  await sharp(maskable1024).resize(512, 512).png().toFile(path.join(outDir, "maskable-512.png"));
  await sharp(maskable1024).resize(192, 192).png().toFile(path.join(outDir, "maskable-192.png"));

  // Apple touch
  await sharp(master1024).resize(180, 180).png().toFile(path.join(outDir, "apple-touch-icon.png"));

  // Favicons PNG
  await sharp(master1024).resize(32, 32).png().toFile(path.join(root, "public", "favicon-32.png"));
  await sharp(master1024).resize(16, 16).png().toFile(path.join(root, "public", "favicon-16.png"));

  // ✅ REAL Windows app icon ICO (must include 256x256)
  const sizes = [256, 128, 64, 48, 32, 16];
  const buffers = [];
  for (const s of sizes) {
    buffers.push(await sharp(master1024).resize(s, s).png().toBuffer());
  }

  const appIco = await pngToIco(buffers);
  await fs.writeFile(path.join(outDir, "icon.ico"), appIco);

  // Keep favicon.ico separate (small is fine)
  const favIco = await pngToIco([
    await sharp(master1024).resize(32, 32).png().toBuffer(),
    await sharp(master1024).resize(16, 16).png().toBuffer(),
  ]);
  await fs.writeFile(path.join(root, "public", "favicon.ico"), favIco);

  const stat = await fs.stat(path.join(outDir, "icon.ico"));
  console.log(`✅ Icons written. icon.ico size = ${stat.size} bytes`);
  console.log("   Expect icon.ico to be MUCH larger than 5,430 bytes.");
})().catch((err) => {
  console.error("❌ gen-icons failed:", err);
  process.exit(1);
});


