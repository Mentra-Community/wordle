export function createCanvas(width: number, height: number): boolean[][] {
  const canvas: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    canvas[y] = new Array(width).fill(false);
  }
  return canvas;
}

export function drawPixel(canvas: boolean[][], x: number, y: number, color: boolean): void {
  if (y >= 0 && y < canvas.length && x >= 0 && x < canvas[0].length) {
    canvas[y][x] = color;
  }
}

export function drawLine(canvas: boolean[][], x1: number, y1: number, x2: number, y2: number, color: boolean): void {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;

  let x = x1;
  let y = y1;

  while (true) {
    drawPixel(canvas, x, y, color);

    if (x === x2 && y === y2) break;

    const err2 = 2 * err;
    if (err2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (err2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

export function drawRect(canvas: boolean[][], x: number, y: number, width: number, height: number, filled: boolean, color: boolean): void {
  if (filled) {
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        drawPixel(canvas, x + dx, y + dy, color);
      }
    }
  } else {
    // Top and bottom lines
    for (let dx = 0; dx < width; dx++) {
      drawPixel(canvas, x + dx, y, color);
      drawPixel(canvas, x + dx, y + height - 1, color);
    }
    // Left and right lines
    for (let dy = 0; dy < height; dy++) {
      drawPixel(canvas, x, y + dy, color);
      drawPixel(canvas, x + width - 1, y + dy, color);
    }
  }
}

export function drawCircle(canvas: boolean[][], cx: number, cy: number, radius: number, color: boolean): void {
  let x = radius;
  let y = 0;
  let radiusError = 1 - x;

  while (x >= y) {
    drawPixel(canvas, cx + x, cy + y, color);
    drawPixel(canvas, cx + y, cy + x, color);
    drawPixel(canvas, cx - x, cy + y, color);
    drawPixel(canvas, cx - y, cy + x, color);
    drawPixel(canvas, cx - x, cy - y, color);
    drawPixel(canvas, cx - y, cy - x, color);
    drawPixel(canvas, cx + x, cy - y, color);
    drawPixel(canvas, cx + y, cy - x, color);

    y++;

    if (radiusError < 0) {
      radiusError += 2 * y + 1;
    } else {
      x--;
      radiusError += 2 * (y - x) + 1;
    }
  }
}

export function create1BitBMP(width: number, height: number, canvas: boolean[][]): Buffer {
  const fileHeaderSize = 14;
  const infoHeaderSize = 40;
  const colorTableSize = 8; // 2 colors * 4 bytes each
  const pixelDataOffset = fileHeaderSize + infoHeaderSize + colorTableSize;
  
  // Calculate row size (must be multiple of 4 bytes)
  const rowSize = Math.ceil(width / 8);
  const paddedRowSize = Math.ceil(rowSize / 4) * 4;
  const pixelDataSize = paddedRowSize * height;
  const fileSize = pixelDataOffset + pixelDataSize;

  const buffer = Buffer.alloc(fileSize);

  // File header
  buffer.write('BM', 0); // Signature
  buffer.writeUInt32LE(fileSize, 2); // File size
  buffer.writeUInt32LE(0, 6); // Reserved
  buffer.writeUInt32LE(pixelDataOffset, 10); // Pixel data offset

  // Info header
  buffer.writeUInt32LE(infoHeaderSize, 14); // Info header size
  buffer.writeInt32LE(width, 18); // Width
  buffer.writeInt32LE(height, 22); // Height
  buffer.writeUInt16LE(1, 26); // Planes
  buffer.writeUInt16LE(1, 28); // Bits per pixel (1-bit)
  buffer.writeUInt32LE(0, 30); // Compression (no compression)
  buffer.writeUInt32LE(pixelDataSize, 34); // Image size
  buffer.writeInt32LE(0, 38); // X pixels per meter
  buffer.writeInt32LE(0, 42); // Y pixels per meter
  buffer.writeUInt32LE(2, 46); // Colors used
  buffer.writeUInt32LE(2, 50); // Important colors

  // Color table (palette)
  // Color 0: Black (0, 0, 0)
  buffer.writeUInt8(0, 54);    // Blue
  buffer.writeUInt8(0, 55);    // Green
  buffer.writeUInt8(0, 56);    // Red
  buffer.writeUInt8(0, 57);    // Reserved

  // Color 1: White (255, 255, 255)
  buffer.writeUInt8(255, 58);  // Blue
  buffer.writeUInt8(255, 59);  // Green
  buffer.writeUInt8(255, 60);  // Red
  buffer.writeUInt8(0, 61);    // Reserved

  // Pixel data (bottom-up format)
  let pixelDataIndex = pixelDataOffset;
  for (let y = height - 1; y >= 0; y--) {
    let rowData = 0;
    let bitCount = 0;

    for (let x = 0; x < width; x++) {
      // true = white (1), false = black (0)
      if (canvas[y][x]) {
        rowData |= (1 << (7 - bitCount));
      }
      
      bitCount++;
      
      if (bitCount === 8) {
        buffer.writeUInt8(rowData, pixelDataIndex++);
        rowData = 0;
        bitCount = 0;
      }
    }

    // Write remaining bits if any
    if (bitCount > 0) {
      buffer.writeUInt8(rowData, pixelDataIndex++);
    }

    // Add padding to make row size multiple of 4
    const padding = paddedRowSize - rowSize;
    for (let p = 0; p < padding; p++) {
      buffer.writeUInt8(0, pixelDataIndex++);
    }
  }

  return buffer;
}