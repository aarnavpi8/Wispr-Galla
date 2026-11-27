// Makes the Android launcher icons and splash screens from src/app/icon.svg (the BolKhata logo).
//   node mobile/make-icons.mjs
// Uses sharp (already installed with Next.js). Run again after changing the logo.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
const res = join(root, "android/app/src/main/res");
const tile = readFileSync(join(root, "src/app/icon.svg"));
// The mark without its green tile, for the adaptive-icon foreground and the splash.
const bare = Buffer.from(
  tile
    .toString()
    .replace(/<rect width="64" height="64"[^>]*\/>/, "")
    .replace(/<defs>[\s\S]*<\/defs>/, ""),
);

const png = (svg, size) => sharp(svg, { density: Math.max(72, (size / 64) * 72 * 2) }).resize(size, size).png();

const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DENSITY)) {
  const dir = join(res, `mipmap-${d}`);
  if (!existsSync(dir)) continue;
  const icon = Math.round(48 * k);
  await png(tile, icon).toFile(join(dir, "ic_launcher.png"));
  // Round icon: the tile, clipped to a circle.
  const circle = Buffer.from(`<svg width="${icon}" height="${icon}"><circle cx="${icon / 2}" cy="${icon / 2}" r="${icon / 2}"/></svg>`);
  await png(tile, icon).composite([{ input: circle, blend: "dest-in" }]).toFile(join(dir, "ic_launcher_round.png"));
  // Adaptive foreground: 108dp canvas, the mark inside the 66dp safe zone.
  const fg = Math.round(108 * k);
  const mark = await png(bare, Math.round(64 * k)).toBuffer();
  await sharp({ create: { width: fg, height: fg, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toFile(join(dir, "ic_launcher_foreground.png"));
}

// Splash: the tile centred on the warm-white paper colour, same sizes as the existing files.
for (const dir of readdirSync(res).filter((n) => n.startsWith("drawable"))) {
  const file = join(res, dir, "splash.png");
  if (!existsSync(file)) continue;
  const { width, height } = await sharp(file).metadata();
  const logo = await png(tile, Math.round(Math.min(width, height) * 0.28)).toBuffer();
  await sharp({ create: { width, height, channels: 4, background: "#faf6ee" } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(file + ".tmp");
  const { renameSync } = await import("node:fs");
  renameSync(file + ".tmp", file);
}
console.log("Android icons and splash screens updated.");
