import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { deflateSync } from 'node:zlib'

const FONT_5X7 = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
}

const ICON_SIZES = [16, 32, 48, 128]

function makeCrcTable() {
  const table = new Uint32Array(256)

  for (let index = 0; index < 256; index += 1) {
    let value = index

    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }

    table[index] = value >>> 0
  }

  return table
}

const CRC_TABLE = makeCrcTable()

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const lengthBuffer = Buffer.alloc(4)
  lengthBuffer.writeUInt32BE(data.length, 0)

  const crcBuffer = Buffer.alloc(4)
  let crc = 0xffffffff

  for (const byte of typeBuffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }

  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }

  crcBuffer.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0)

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer])
}

function writePixel(buffer, size, x, y, color) {
  const rowStride = size * 4 + 1
  const offset = y * rowStride + 1 + x * 4
  buffer[offset] = color[0]
  buffer[offset + 1] = color[1]
  buffer[offset + 2] = color[2]
  buffer[offset + 3] = color[3]
}

function fillRoundedRect(buffer, size, backgroundColor) {
  const radius = Math.max(2, Math.floor(size * 0.22))

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const left = x < radius
      const right = x >= size - radius
      const top = y < radius
      const bottom = y >= size - radius

      let inCornerCutout = false

      if ((left || right) && (top || bottom)) {
        const cornerX = left ? radius - 1 : size - radius
        const cornerY = top ? radius - 1 : size - radius
        const dx = x - cornerX
        const dy = y - cornerY
        inCornerCutout = dx * dx + dy * dy > radius * radius
      }

      if (!inCornerCutout) {
        writePixel(buffer, size, x, y, backgroundColor)
      }
    }
  }
}

function drawGlyph(buffer, size, glyphRows, foregroundColor) {
  const rows = glyphRows.length
  const columns = glyphRows[0].length
  const scale = Math.max(1, Math.floor(size / 10))
  const glyphWidth = columns * scale
  const glyphHeight = rows * scale
  const startX = Math.floor((size - glyphWidth) / 2)
  const startY = Math.floor((size - glyphHeight) / 2)

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (glyphRows[row][column] !== '1') {
        continue
      }

      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          writePixel(
            buffer,
            size,
            startX + column * scale + x,
            startY + row * scale + y,
            foregroundColor
          )
        }
      }
    }
  }
}

function encodePng(size, backgroundColor, foregroundColor, glyphRows) {
  const raw = Buffer.alloc((size * 4 + 1) * size)

  fillRoundedRect(raw, size, backgroundColor)
  drawGlyph(raw, size, glyphRows, foregroundColor)

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const idat = deflateSync(raw)
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ])

  return Buffer.concat([
    signature,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', idat),
    createChunk('IEND', Buffer.alloc(0)),
  ])
}

export async function writeProviderIcons(
  distDir,
  { label, backgroundColor, foregroundColor }
) {
  const glyphRows = FONT_5X7[label]

  if (!glyphRows) {
    throw new Error(`Unsupported icon label: ${label}`)
  }

  await Promise.all(
    ICON_SIZES.map((size) =>
      writeFile(
        resolve(distDir, `icon-${size}.png`),
        encodePng(size, backgroundColor, foregroundColor, glyphRows)
      )
    )
  )
}

export function createIconManifestEntries() {
  return Object.fromEntries(
    ICON_SIZES.map((size) => [String(size), `icon-${size}.png`])
  )
}
