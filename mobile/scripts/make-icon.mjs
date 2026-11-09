// Draws the app icon and splash mark into mobile/assets with no image
// dependencies: a brass coin with a milled edge and an M, on ink.
//
//   node mobile/scripts/make-icon.mjs
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const assets = join(here, '..', 'assets')

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buffer) => {
  let c = 0xffffffff
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}
const encodePng = (size, rgb) => {
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const mix = (a, b, t) => a.map((value, index) => Math.round(value + (b[index] - value) * Math.min(1, Math.max(0, t))))

const INK = [26, 23, 18]
const BRASS_DARK = [150, 104, 31]
const BRASS_LIGHT = [240, 210, 150]
const BRASS_RIM = [122, 90, 32]
const onCoin = [43, 35, 24]

/** Distance from a point to a segment, for the M's strokes. */
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function draw(size) {
  const pixels = Buffer.alloc(size * size * 3)
  const center = size / 2
  const radius = size * 0.365
  const stroke = size * 0.062
  const m = [
    [-0.40, 0.40, -0.40, -0.36],
    [-0.40, -0.36, 0.0, 0.14],
    [0.0, 0.14, 0.40, -0.36],
    [0.40, -0.36, 0.40, 0.40],
  ]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const distance = Math.hypot(px - center, py - center)
      let color = INK

      if (distance <= radius) {
        // Light from the top left, as if the coin sat on a table.
        const light = 0.5 + 0.5 * ((center - px) * 0.5 + (center - py) * 0.8) / radius
        color = mix(BRASS_DARK, BRASS_LIGHT, 0.25 + light * 0.6)

        const rim = Math.abs(distance - radius * 0.9)
        if (rim < radius * 0.022) color = mix(color, BRASS_RIM, 0.75)
        const inner = Math.abs(distance - radius * 0.55)
        if (inner < radius * 0.012) color = mix(color, BRASS_RIM, 0.45)

        // Milled edge: notches around the rim.
        const angle = Math.atan2(py - center, px - center)
        if (distance > radius * 0.955 && Math.sin(angle * 48) > 0.55) color = mix(color, BRASS_RIM, 0.5)

        // The letterform.
        let nearest = Infinity
        for (const [ax, ay, bx, by] of m) {
          nearest = Math.min(nearest, segmentDistance(px, py, center + ax * radius, center + ay * radius, center + bx * radius, center + by * radius))
        }
        if (nearest < stroke / 2) color = mix(color, onCoin, 0.94)
        if (distance > radius - 1.5) color = mix(color, INK, 0.6)
      }

      const offset = (y * size + x) * 3
      pixels[offset] = color[0]
      pixels[offset + 1] = color[1]
      pixels[offset + 2] = color[2]
    }
  }
  return pixels
}

/** 2x2 supersampling, so the circle and the letterform have clean edges. */
function render(size) {
  const scale = 2
  const large = draw(size * scale)
  const out = Buffer.alloc(size * size * 3)
  const width = size * scale
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0]
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const offset = ((y * scale + sy) * width + (x * scale + sx)) * 3
          sum[0] += large[offset]
          sum[1] += large[offset + 1]
          sum[2] += large[offset + 2]
        }
      }
      const offset = (y * size + x) * 3
      out[offset] = Math.round(sum[0] / (scale * scale))
      out[offset + 1] = Math.round(sum[1] / (scale * scale))
      out[offset + 2] = Math.round(sum[2] / (scale * scale))
    }
  }
  return applyMask(out, size)
}

/** iOS rounds the corners itself; keep the square fully painted. */
function applyMask(pixels) {
  return pixels
}

mkdirSync(assets, { recursive: true })
writeFileSync(join(assets, 'icon.png'), encodePng(1024, render(1024)))
writeFileSync(join(assets, 'splash-icon.png'), encodePng(512, render(512)))
console.log('wrote assets/icon.png (1024) and assets/splash-icon.png (512)')
