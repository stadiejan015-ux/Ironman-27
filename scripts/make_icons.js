#!/usr/bin/env node
/*
 * Erzeugt die App-Icons aus einer SVG (Stil der Seite: dunkler Grund, „27“, Streifen in den Sportfarben).
 *   node scripts/make_icons.js
 * Schreibt icons/icon.svg sowie icons/apple-touch-icon.png (180), icon-192.png, icon-512.png und
 * icon-maskable-512.png (Motiv im sicheren Bereich, damit Android es rund/eckig zuschneiden kann).
 * Benötigt Playwright mit Chromium (zum Rendern der SVG); die fertigen PNGs liegen im Repository.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "icons");
const C = { bg: "#111110", text: "#f4f3f0", muted: "#8f8d87", swim: "#3987e5", bike: "#d95926", run: "#199e70" };

// scale < 1 rückt das Motiv in die Mitte (maskable: sicherer Bereich = Kreis mit 80 % Durchmesser)
function svg(scale = 1) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${C.bg}"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)" font-family="Inter, 'Helvetica Neue', Arial, sans-serif">
    <text x="256" y="150" text-anchor="middle" font-size="50" font-weight="700" letter-spacing="9" fill="${C.muted}">IRONMAN</text>
    <text x="256" y="352" text-anchor="middle" font-size="236" font-weight="800" letter-spacing="-10" fill="${C.text}">27</text>
    <rect x="128" y="384" width="72" height="22" rx="11" fill="${C.swim}"/>
    <rect x="220" y="384" width="72" height="22" rx="11" fill="${C.bike}"/>
    <rect x="312" y="384" width="72" height="22" rx="11" fill="${C.run}"/>
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
