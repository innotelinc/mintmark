// Draws the app icon and splash mark into mobile/assets with no image
// dependencies: a struck brass coin with a milled edge and an embossed M, on ink.
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
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v)

const INK = [24, 21, 16]
const INK_DEEP = [13, 11, 9]
const BRASS_DARK = [92, 62, 18]
const BRASS_MID = [205, 165, 84]
const BRASS_LIGHT = [247, 222, 166]
const BRASS_RIM = [116, 82, 26]
const BRASS_SHEEN = [255, 242, 208]
const LETTER = [40, 32, 21]
const LETTER_LIT = [255, 238, 198]
const LETTER_SHADOW = [92, 60, 16]

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
  const emboss = Math.max(1.2, size * 0.0085)
  // The monogram, in units of the coin radius, centred on the field.
  const strokes = [
    [-0.42, 0.42, -0.42, -0.38],
    [-0.42, -0.38, 0.0, 0.16],
    [0.0, 0.16, 0.42, -0.38],
    [0.42, -0.38, 0.42, 0.42],
  ]

  /** How far a point is from the letterform, optionally shifted for an emboss. */
  const letterDistance = (px, py, shift = 0) => {
    let nearest = Infinity
    for (const [ax, ay, bx, by] of strokes) {
      nearest = Math.min(
        nearest,
        segmentDistance(
          px,
          py,
          center + ax * radius + shift,
          center + ay * radius + shift,
          center + bx * radius + shift,
          center + by * radius + shift,
        ),
      )
    }
    return nearest
  }
  // Width of the bevel band around the monogram, and the step used to read the
  // direction the letterform's edge faces.
  const bevel = Math.max(2, size * 0.011)
  const step = Math.max(1, size * 0.004)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const distance = Math.hypot(px - center, py - center)
      const angle = Math.atan2(py - center, px - center)

      // Ink board that the coin rests on, darker at the edges.
      const board = Math.min(1, Math.max(0, distance / (radius * 1.9)))
      let color = mix(INK, INK_DEEP, board * 0.9)

      if (distance <= radius) {
        const t = distance / radius
        // Brass lit from the upper left, a little darker towards the rim.
        const light = 0.5 + 0.5 * ((center - px) * 0.45 + (center - py) * 0.9) / radius
        color = mix(BRASS_DARK, BRASS_MID, 0.1 + light * 0.6)
        color = mix(color, BRASS_LIGHT, Math.max(0, light - 0.6) * 1.35)

        // Faint concentric strike marks in the field.
        const rings = Math.sin(distance * 0.42) * 0.9
        color = color.map((channel) => clamp(channel + rings))

        // Recessed inner ring, struck deeper than the field.
        const inner = Math.abs(distance - radius * 0.78)
        if (inner < radius * 0.016) color = mix(color, BRASS_RIM, 0.55 * (1 - inner / (radius * 0.016)))

        // Milled edge: fine teeth, then a darker collar behind them.
        if (t > 0.93) {
          const teeth = 0.5 + 0.5 * Math.sin(angle * 132)
          color = mix(color, BRASS_RIM, (t - 0.93) * 3.6 * (0.4 + teeth * 0.45))
        }

        // A specular sheen across the upper left of the field.
        const sheen = Math.exp(-(((px - center + radius * 0.34) ** 2 + (py - center + radius * 0.42) ** 2) / (radius * radius * 0.10)))
        color = color.map((channel) => clamp(channel + sheen * 26))

        // Rim highlight on the lit side of the coin.
        if (t > 0.955) {
          const lit = Math.max(0, Math.cos(angle - Math.PI * 1.25))
          color = mix(color, BRASS_SHEEN, lit * 0.32 * (1 - (t - 0.955) / 0.045))
        }

        // The monogram: struck into the face, lit on its upper-left edge and
        // shadowed on the lower right, so it reads as relief rather than ink.
        const facing = letterDistance(px, py) - stroke / 2
        if (facing < 0) {
          color = mix(color, LETTER, 0.96)
          if (facing > -bevel) {
            // Which way this bit of edge points, from the distance field: the
            // side facing the light catches it, the far side falls to shadow.
            const gx = letterDistance(px + step, py) - letterDistance(px - step, py)
            const gy = letterDistance(px, py + step) - letterDistance(px, py - step)
            const lit = -(gx * 0.62 + gy * 0.78) / (Math.hypot(gx, gy) || 1)
            const edge = 1 + facing / bevel
            color =
              lit > 0
                ? mix(color, LETTER_LIT, lit * edge * 0.85)
                : mix(color, LETTER_SHADOW, -lit * edge * 0.45)
          }
        } else if (facing < emboss * 1.4) {
          // A soft contact shadow on the face, cast towards the lower right.
          color = mix(color, LETTER_SHADOW, 0.3 * (1 - facing / (emboss * 1.4)))
        }

        // Keep the coin's outer edge crisp against the board.
        if (distance > radius - Math.max(1, size * 0.0015)) color = mix(color, INK, 0.55)
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
  return out
}

mkdirSync(assets, { recursive: true })
// iOS rounds the corners itself, so the square stays fully painted.
writeFileSync(join(assets, 'icon.png'), encodePng(1024, render(1024)))
writeFileSync(join(assets, 'splash-icon.png'), encodePng(512, render(512)))
console.log('wrote assets/icon.png (1024) and assets/splash-icon.png (512)')
