#!/usr/bin/env node
/*
 * Erzeugt die App-Icons aus einer SVG (rot-weiß: roter Grund, weißer Punkt, große „27“, Schriftzug „IRONMAN“).
 *   node scripts/make_icons.js
 * Schreibt icons/icon.svg sowie icons/apple-touch-icon.png (180), icon-192.png, icon-512.png und
 * icon-maskable-512.png (Motiv im sicheren Bereich, damit Android es rund/eckig zuschneiden kann).
 * Benötigt Playwright mit Chromium (zum Rendern der SVG); die fertigen PNGs liegen im Repository.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "icons");
const C = { bg: "#d71e28", text: "#ffffff" };   // Rot-Weiß

// scale < 1 rückt das Motiv in die Mitte (maskable: sicherer Bereich = Kreis mit 80 % Durchmesser)
function svg(scale = 1) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${C.bg}"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)" font-family="Inter, 'Helvetica Neue', Arial, sans-serif" fill="${C.text}">
    <circle cx="256" cy="108" r="34"/>
    <text x="256" y="378" text-anchor="middle" font-size="268" font-weight="800" letter-spacing="-12">27</text>
    <text x="256" y="436" text-anchor="middle" font-size="38" font-weight="700" letter-spacing="10" opacity=".9">IRONMAN</text>
  </g>
</svg>`;
}

(async () => {
  const { chromium } = require("playwright");
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "icon.svg"), svg(1) + "\n");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const jobs = [
    ["apple-touch-icon.png", 180, 1],
    ["icon-192.png", 192, 1],
    ["icon-512.png", 512, 1],
    ["icon-maskable-512.png", 512, 0.78],
  ];
  for (const [file, size, scale] of jobs) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:${C.bg}">${svg(scale).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
    await page.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: 0, width: size, height: size } });
    console.log(`icons/${file} (${size}×${size})`);
  }
  await browser.close();
})();
