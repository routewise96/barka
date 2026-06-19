/**
 * scripts/gen-ui-placeholder.mjs — генерирует дружелюбный плейсхолдер «сломанная
 * картинка» для graceful degradation (часть 2). Без внешних библиотек: рисуем
 * пиксели и кодируем PNG через node:zlib.
 *
 * Образ нейтральный и НЕ пугающий ребёнка: мягкий тёплый фон + «фото»-панель с
 * солнышком и холмами (универсальная иконка картинки). Никаких крестов/ошибок.
 *
 * Запуск:  node scripts/gen-ui-placeholder.mjs
 * Результат: assets/ui/broken-image.png (256×256, RGB).
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'assets', 'ui', 'broken-image.png');

const W = 256;
const H = 256;
const buf = new Uint8Array(W * H * 3);

function setPx(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
}
function fillRect(x0, y0, x1, y1, c) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) setPx(x, y, c[0], c[1], c[2]);
}
function fillRoundRect(x0, y0, x1, y1, rad, c) {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      // скругление углов
      let cx = null,
        cy = null;
      if (x < x0 + rad && y < y0 + rad) (cx = x0 + rad), (cy = y0 + rad);
      else if (x >= x1 - rad && y < y0 + rad) (cx = x1 - rad - 1), (cy = y0 + rad);
      else if (x < x0 + rad && y >= y1 - rad) (cx = x0 + rad), (cy = y1 - rad - 1);
      else if (x >= x1 - rad && y >= y1 - rad) (cx = x1 - rad - 1), (cy = y1 - rad - 1);
      if (cx !== null) {
        const dx = x - cx,
          dy = y - cy;
        if (dx * dx + dy * dy > rad * rad) continue;
      }
      setPx(x, y, c[0], c[1], c[2]);
    }
}
function fillCircle(cx, cy, rad, c) {
  for (let y = cy - rad; y <= cy + rad; y++)
    for (let x = cx - rad; x <= cx + rad; x++) {
      const dx = x - cx,
        dy = y - cy;
      if (dx * dx + dy * dy <= rad * rad) setPx(x, y, c[0], c[1], c[2]);
    }
}
/** Заливка «холма» — верхний купол круга с центром на baseline (мягкая дуга). */
function fillHill(cx, baseY, rad, c) {
  for (let y = baseY - rad; y <= baseY; y++)
    for (let x = cx - rad; x <= cx + rad; x++) {
      const dx = x - cx,
        dy = y - baseY;
      if (dx * dx + dy * dy <= rad * rad && y <= baseY) setPx(x, y, c[0], c[1], c[2]);
    }
}

// — палитра (мягкие тёплые тона, дружелюбно) —
const CREAM = [253, 235, 208]; // тёплый фон
const PANEL = [255, 251, 244]; // «фото»-панель
const FRAME = [224, 166, 120]; // рамка-терракота
const SUN = [255, 210, 122]; // солнышко
const HILL1 = [201, 138, 106]; // дальний холм
const HILL2 = [231, 178, 132]; // ближний холм

// фон
fillRect(0, 0, W, H, CREAM);
// рамка + панель (рамка = чуть больше панели)
fillRoundRect(28, 28, 228, 228, 26, FRAME);
fillRoundRect(40, 40, 216, 216, 18, PANEL);
// солнышко
fillCircle(96, 96, 22, SUN);
// холмы (внутри панели, baseline ~ 200)
fillHill(110, 200, 64, HILL1);
fillHill(168, 200, 52, HILL2);
// «земля» — нижняя полоса панели поверх обрезок
fillRect(40, 200, 216, 216, HILL2);

// ---- PNG-кодирование (RGB, 8 бит, без альфы) ----
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = data.length;
  const out = new Uint8Array(12 + len);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, len, false);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + len));
  dv.setUint32(8 + len, crc, false);
  return out;
}

// IHDR
const ihdr = new Uint8Array(13);
const dvh = new DataView(ihdr.buffer);
dvh.setUint32(0, W, false);
dvh.setUint32(4, H, false);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type 2 = RGB
// 10,11,12 = 0 (deflate / no filter / no interlace)

// raw scanlines с фильтром 0
const raw = new Uint8Array(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0;
  raw.set(buf.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
}
const idat = deflateSync(raw, { level: 9 });

const SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const png = Buffer.concat([
  Buffer.from(SIG),
  Buffer.from(chunk('IHDR', ihdr)),
  Buffer.from(chunk('IDAT', idat)),
  Buffer.from(chunk('IEND', new Uint8Array(0))),
]);
writeFileSync(OUT, png);
console.log(`✓ ${OUT} — ${W}×${H}, ${png.length} байт`);
