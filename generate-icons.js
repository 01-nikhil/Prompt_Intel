/**
 * generate-icons.js — Creates simple PNG icons for the Chrome extension
 * Run: node generate-icons.js
 */
const fs = require('fs');
const path = require('path');

// Minimal PNG generator (creates a simple solid-color icon with a "Pi" look)
function createPNG(size) {
    // We'll create a simple BMP-style approach using raw pixel data
    // then wrap it in PNG format

    const pixels = Buffer.alloc(size * size * 4); // RGBA

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;

            // Rounded rectangle check
            const cornerRadius = Math.floor(size * 0.22);
            const isInRoundedRect = isInsideRoundedRect(x, y, size, size, cornerRadius);

            if (isInRoundedRect) {
                // Gradient from indigo to purple
                const t = (x + y) / (size * 2);
                const r = Math.round(99 + (168 - 99) * t);   // #6366f1 → #a855f7
                const g = Math.round(102 + (85 - 102) * t);
                const b = Math.round(241 + (247 - 241) * t);

                // Draw "Pi" text area (simplified as a lighter center region)
                const centerX = size / 2;
                const centerY = size / 2;
                const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
                const maxDist = size * 0.35;

                if (dist < maxDist * 0.15) {
                    // Bright center dot
                    pixels[idx] = 255;
                    pixels[idx + 1] = 255;
                    pixels[idx + 2] = 255;
                    pixels[idx + 3] = 255;
                } else if (dist < maxDist) {
                    // Lightning bolt / sparkle pattern
                    const angle = Math.atan2(y - centerY, x - centerX);
                    const rays = Math.abs(Math.sin(angle * 3));
                    if (rays > 0.8 && dist < maxDist * 0.8) {
                        pixels[idx] = 255;
                        pixels[idx + 1] = 255;
                        pixels[idx + 2] = 255;
                        pixels[idx + 3] = Math.round(200 * (1 - dist / maxDist));
                    } else {
                        pixels[idx] = r;
                        pixels[idx + 1] = g;
                        pixels[idx + 2] = b;
                        pixels[idx + 3] = 255;
                    }
                } else {
                    pixels[idx] = r;
                    pixels[idx + 1] = g;
                    pixels[idx + 2] = b;
                    pixels[idx + 3] = 255;
                }
            } else {
                // Transparent
                pixels[idx] = 0;
                pixels[idx + 1] = 0;
                pixels[idx + 2] = 0;
                pixels[idx + 3] = 0;
            }
        }
    }

    return encodePNG(pixels, size, size);
}

function isInsideRoundedRect(x, y, w, h, r) {
    if (x < r && y < r) return (x - r) ** 2 + (y - r) ** 2 <= r ** 2;
    if (x >= w - r && y < r) return (x - (w - r - 1)) ** 2 + (y - r) ** 2 <= r ** 2;
    if (x < r && y >= h - r) return (x - r) ** 2 + (y - (h - r - 1)) ** 2 <= r ** 2;
    if (x >= w - r && y >= h - r) return (x - (w - r - 1)) ** 2 + (y - (h - r - 1)) ** 2 <= r ** 2;
    return true;
}

// Minimal PNG encoder (uncompressed)
function encodePNG(pixels, width, height) {
    const zlib = require('zlib');

    // PNG signature
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    // IHDR chunk
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // color type (RGBA)
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace

    // Filter raw data (add filter byte 0 at start of each row)
    const rawData = Buffer.alloc(height * (1 + width * 4));
    for (let y = 0; y < height; y++) {
        rawData[y * (1 + width * 4)] = 0; // filter: none
        pixels.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
    }

    const compressed = zlib.deflateSync(rawData);

    // Build chunks
    function makeChunk(type, data) {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length, 0);
        const typeBuffer = Buffer.from(type);
        const crcData = Buffer.concat([typeBuffer, data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(crcData), 0);
        return Buffer.concat([len, typeBuffer, data, crc]);
    }

    const ihdrChunk = makeChunk('IHDR', ihdr);
    const idatChunk = makeChunk('IDAT', compressed);
    const iendChunk = makeChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// CRC32 for PNG
function crc32(buf) {
    let crc = 0xffffffff;
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c;
    }
    for (let i = 0; i < buf.length; i++) {
        crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

// Generate icons
const iconsDir = path.join(__dirname, 'extension', 'icons');
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

for (const size of [16, 48, 128]) {
    const png = createPNG(size);
    fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), png);
    console.log(`Created icon${size}.png (${png.length} bytes)`);
}

console.log('Done!');
