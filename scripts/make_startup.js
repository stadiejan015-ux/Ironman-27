#!/usr/bin/env node
/*
 * Startbilder für den Home-Bildschirm-Modus (iOS „apple-touch-startup-image“).
 * iOS zeigt das passende Bild sofort beim Start der App, bis die Seite gezeichnet ist – so blitzt nichts weiß auf.
 * Die Bilder sind einfarbig im Seitenhintergrund (--bg in css/style.css): hell #f2f2f7, dunkel #000000.
 *   node scripts/make_startup.js
 * Schreibt icons/startup/<Breite>x<Höhe>-<light|dark>.png und die <link>-Zeilen in index.html
 * (zwischen <!-- startup:begin --> und <!-- startup:end -->). Ohne Abhängigkeiten (PNG mit zlib, 1-Bit-Palette).
 * iOS braucht je Gerät die exakte Pixelgröße; neue Geräte unten in DEVICES ergänzen.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "icons", "startup");
const SCHEMES = { light: [0xf2, 0xf2, 0xf7], dark: [0x00, 0x00, 0x00] };   // wie --bg

// [Name, CSS-Breite, CSS-Höhe (hochkant), Pixeldichte, auch quer?]
const DEVICES = [
  ["iPhone 16/17 Pro Max", 440, 956, 3, false],
  ["iPhone Air", 420, 912, 3, false],
  ["iPhone 16 Pro, 17", 402, 874, 3, false],
  ["iPhone 14 Pro Max – 16 Plus", 430, 932, 3, false],
  ["iPhone 14 Pro – 16", 393, 852, 3, false],
  ["iPhone 12 – 14, 16e", 390, 844, 3, false],
  ["iPhone 12 Pro Max – 14 Plus", 428, 926, 3, false],
  ["iPhone X – 13 mini", 375, 812, 3, false],
  ["iPhone XS Max, 11 Pro Max", 414, 896, 3, false],
  ["iPhone XR, 11", 414, 896, 2, false],
  ["iPhone 6s Plus – 8 Plus", 414, 736, 3, false],
  ["iPhone SE, 6s – 8", 375, 667, 2, false],
  ["iPad Pro 13 (M4)", 1032, 1376, 2, true],
  ["iPad Pro 12,9, iPad Air 13", 1024, 1366, 2, true],
  ["iPad Pro 11 (M4)", 834, 1210, 2, true],
  ["iPad Pro 11", 834, 1194, 2, true],
  ["iPad Air 10,9/11, iPad 10", 820, 1180, 2, true],
  ["iPad 10,2", 810, 1080, 2, true],
  ["iPad Pro 10,5, iPad Air 3", 834, 1112, 2, true],
  ["iPad mini 6/7", 744, 1133, 2, true],
  ["iPad 9,7, iPad mini 5", 768, 1024, 2, true],
];

/* ---------- PNG ---------- */
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
// Einfarbig als Palettenbild mit 1 Bit pro Pixel (eine Farbe): jede Zeile nur Nullen → wenige KB pro Bild
function solidPng(w, h, [r, g, b]) {
  const row = Buffer.alloc(1 + Math.ceil(w / 8));             // Filter 0 + Pixel (alle Index 0)
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 1; ihdr[9] = 3;   // 1 bit, Palette
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr),
    chunk("PLTE", Buffer.from([r, g, b])), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/* ---------- Bilder und <link>-Zeilen ---------- */
fs.mkdirSync(OUT, { recursive: true });
const links = [];
let bytes = 0;
for (const [name, cw, ch, dpr, landscape] of DEVICES) {
  const orients = landscape ? ["portrait", "landscape"] : ["portrait"];
  links.push(`  <!-- ${name} -->`);
  for (const o of orients) {
    const w = (o === "portrait" ? cw : ch) * dpr, h = (o === "portrait" ? ch : cw) * dpr;
    for (const [scheme, rgb] of Object.entries(SCHEMES)) {
      const file = `${w}x${h}-${scheme}.png`;
      const png = solidPng(w, h, rgb);
      fs.writeFileSync(path.join(OUT, file), png);
      bytes += png.length;
      links.push(`  <link rel="apple-touch-startup-image" media="(device-width: ${cw}px) and (device-height: ${ch}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: ${o}) and (prefers-color-scheme: ${scheme})" href="icons/startup/${file}">`);
    }
  }
}

const INDEX = path.join(ROOT, "index.html");
const html = fs.readFileSync(INDEX, "utf8");
const re = /<!-- startup:begin -->[\s\S]*?<!-- startup:end -->/;
if (!re.test(html)) throw new Error("Marker <!-- startup:begin --> / <!-- startup:end --> fehlen in index.html");
fs.writeFileSync(INDEX, html.replace(re, () => `<!-- startup:begin -->\n${links.join("\n")}\n  <!-- startup:end -->`));
console.log(`${links.filter((l) => l.includes("<link")).length} Startbilder (${Math.round(bytes / 1024)} KB) in icons/startup, Links in index.html`);
