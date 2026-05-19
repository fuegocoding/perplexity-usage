const fs = require('fs');
const zlib = require('zlib');

function makeCrcTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
}
const crcTable = makeCrcTable();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function writeU32(buf, v, o) { buf[o]=(v>>>24)&0xFF; buf[o+1]=(v>>>16)&0xFF; buf[o+2]=(v>>>8)&0xFF; buf[o+3]=v&0xFF; }
function chunk(type, data) {
  const len = data ? data.length : 0;
  const c = Buffer.alloc(12 + len);
  writeU32(c, len, 0); c.write(type, 4, 4, 'ascii');
  if (data) data.copy(c, 8);
  writeU32(c, crc32(c.slice(4, 8 + len)), 8 + len);
  return c;
}
function createPNG(size, drawFn) {
  const sig = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
  const ihdrD = Buffer.alloc(13);
  writeU32(ihdrD, size, 0); writeU32(ihdrD, size, 4);
  ihdrD[8]=8; ihdrD[9]=6; ihdrD[10]=0; ihdrD[11]=0; ihdrD[12]=0;
  const ihdr = chunk('IHDR', ihdrD);
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const rgba = drawFn(x, y, size);
      const i = (y * size + x) * 4;
      pixels[i]=rgba[0]; pixels[i+1]=rgba[1]; pixels[i+2]=rgba[2]; pixels[i+3]=rgba[3];
    }
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const off = y * (1 + size * 4);
    raw[off] = 0;
    pixels.copy(raw, off + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = chunk('IDAT', zlib.deflateSync(raw, { level: 9 }));
  const iend = chunk('IEND', null);
  return Buffer.concat([sig, ihdr, idat, iend]);
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function compositeOver(src, dst) {
  const sa = src[3] / 255;
  const da = dst[3] / 255;
  if (sa === 0) return dst;
  const outA = sa + da * (1 - sa);
  if (outA === 0) return [0, 0, 0, 0];
  return [
    Math.round((src[0]*sa + dst[0]*da*(1-sa)) / outA),
    Math.round((src[1]*sa + dst[1]*da*(1-sa)) / outA),
    Math.round((src[2]*sa + dst[2]*da*(1-sa)) / outA),
    Math.round(outA * 255),
  ];
}

const TUR = [32, 184, 205];
const WHITE = [240, 240, 240];
const BLACK = [15, 15, 15];

function drawBackground(x, y, s) {
  const cx = s * 0.5, cy = s * 0.5;
  const R = s * 0.48;
  const dx = x - cx, dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Black filled circle with AA edge
  if (dist <= R + 1) {
    const alpha = dist <= R - 0.5 ? 1 : clamp01((R + 0.5 - dist));
    return [...BLACK, Math.round(alpha * 255)];
  }
  return [0, 0, 0, 0]; // transparent
}

function drawGauge(x, y, s) {
  const cx = s * 0.5;
  const cy = s * 0.52;
  const outerR = s * 0.42;
  const innerR = s * 0.30;
  const lineW = Math.max(1, s / 20);

  const dx = x - cx, dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const pixAngle = Math.atan2(dy, dx);
  const normAngle = ((pixAngle % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI);
  const inGap = normAngle >= Math.PI / 4 && normAngle <= 3 * Math.PI / 4;
  const inBand = dist >= innerR && dist <= outerR;

  if (inBand && !inGap) {
    const dInner = Math.abs(dist - innerR);
    const dOuter = Math.abs(dist - outerR);
    const aa = Math.max(1, lineW * 0.15);
    let alpha = 1.0;
    if (dInner < aa) alpha = Math.min(alpha, dInner / aa);
    if (dOuter < aa) alpha = Math.min(alpha, dOuter / aa);
    const gapEdgeDist = Math.min(
      Math.abs(normAngle - Math.PI / 4),
      Math.abs(normAngle - 3 * Math.PI / 4)
    );
    if (gapEdgeDist < aa * 1.5) {
      alpha = Math.min(alpha, gapEdgeDist / (aa * 1.5));
    }
    return [...TUR, Math.round(clamp01(alpha) * 255)];
  }

  if (!inGap && dist > outerR && dist < outerR + 2) {
    const t = (dist - outerR) / 2;
    return [...TUR, Math.round(clamp01(1 - t) * 50)];
  }
  if (!inGap && dist < innerR && dist > innerR - 2) {
    const t = (innerR - dist) / 2;
    return [...TUR, Math.round(clamp01(1 - t) * 50)];
  }

  // Needle at 72%
  const needlePct = 0.72;
  const needleDeg = 225 - needlePct * 270;
  const needleRad = needleDeg * Math.PI / 180;
  const nDx = Math.sin(needleRad);
  const nDy = -Math.cos(needleRad);
  const needleLen = outerR - lineW;
  const needleHalfW = Math.max(1, s / 60);
  const proj = dx * nDx + dy * nDy;
  const perp = Math.abs(dx * (-nDy) + dy * nDx);

  if (proj > 0 && proj < needleLen) {
    const taper = 1 - (proj / needleLen) * 0.7;
    const hw = needleHalfW * taper;
    if (perp < hw + 0.8) {
      const alpha = perp < hw ? 1 : clamp01(1 - (perp - hw) / 0.8);
      return [...WHITE, Math.round(clamp01(alpha) * 255)];
    }
  }

  // Center dot
  const centerR = Math.max(2, s / 16);
  if (dist < centerR + 1) {
    const alpha = dist <= centerR - 0.5 ? 1 : clamp01((centerR + 0.5 - dist));
    return [...WHITE, Math.round(clamp01(alpha) * 255)];
  }

  // Tick marks at 0%, 25%, 50%, 75%, 100%
  const tickInnerR = innerR - lineW;
  const tickOuterR = innerR - lineW * 3.5;
  const tickHalfW = Math.max(0.5, s / 80);
  const ticks = [0, 0.25, 0.5, 0.75, 1.0];
  for (const pct of ticks) {
    const tDeg = 225 - pct * 270;
    const tRad = tDeg * Math.PI / 180;
    const tDx = Math.sin(tRad);
    const tDy = -Math.cos(tRad);
    const tProj = dx * tDx + dy * tDy;
    const tPerp = Math.abs(dx * (-tDy) + dy * tDx);
    if (tProj >= tickOuterR && tProj <= tickInnerR && tPerp < tickHalfW + 0.5) {
      const alpha = tPerp < tickHalfW ? 0.85 : clamp01(1 - (tPerp - tickHalfW) / 0.5) * 0.85;
      return [...WHITE, Math.round(clamp01(alpha) * 255)];
    }
  }

  return [0, 0, 0, 0]; // transparent
}

function drawDot(x, y, s, dotColor) {
  if (!dotColor) return [0, 0, 0, 0];
  const dotCx = s * 0.82;
  const dotCy = s * 0.82;
  const dotR = s <= 16 ? s * 0.15 : s * 0.09;
  const ddx = x - dotCx, ddy = y - dotCy;
  const dDist = Math.sqrt(ddx * ddx + ddy * ddy);
  if (dDist <= dotR + 1) {
    const alpha = dDist <= dotR - 0.5 ? 1 : clamp01((dotR + 0.5 - dDist));
    return [...dotColor, Math.round(alpha * 255)];
  }
  return [0, 0, 0, 0];
}

function drawIcon(x, y, s, dotColor) {
  const bg = drawBackground(x, y, s);
  const gauge = drawGauge(x, y, s);
  const dot = drawDot(x, y, s, dotColor);
  // Composite: background -> gauge -> dot (front overrides back)
  let result = bg;
  if (gauge[3] > 0) result = compositeOver(gauge, result);
  if (dot[3] > 0) result = compositeOver(dot, result);
  return result;
}

const GREEN = [16, 185, 129];
const RED = [239, 68, 68];
const SIZES = [16, 48, 128];

for (const sz of SIZES) {
  fs.writeFileSync(`icons/icon${sz}.png`, createPNG(sz, (x, y, s) => drawIcon(x, y, s, null)));
  fs.writeFileSync(`icons/icon${sz}-green.png`, createPNG(sz, (x, y, s) => drawIcon(x, y, s, GREEN)));
  fs.writeFileSync(`icons/icon${sz}-red.png`, createPNG(sz, (x, y, s) => drawIcon(x, y, s, RED)));
}

console.log('Icons generated.');