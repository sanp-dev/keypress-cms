// src/lib/imageDimensions.ts
// Lightweight image dimension parser for JPEG, PNG, WebP, GIF.
// No external dependencies — works on Cloudflare Workers.

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * Extracts width and height from an image buffer by reading file headers.
 * Supports JPEG, PNG, WebP, and GIF.
 * Returns null if dimensions cannot be determined.
 */
export function getImageDimensions(buffer: ArrayBuffer): ImageSize | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 10) return null;

  // ── PNG ──
  // Signature: 89 50 4E 47 0D 0A 1A 0A
  // IHDR chunk starts at offset 8, width at 16, height at 20 (big-endian uint32)
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    if (bytes.length < 24) return null;
    const view = new DataView(buffer);
    return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
  }

  // ── GIF ──
  // Signature: "GIF87a" or "GIF89a"
  // Width at offset 6 (little-endian uint16), Height at offset 8
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    if (bytes.length < 10) return null;
    const view = new DataView(buffer);
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }

  // ── WebP ──
  // RIFF....WEBP, then VP8 /VP8L/VP8X chunk
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    // VP8X (extended)
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58) {
      if (bytes.length < 30) return null;
      // Canvas width = 1 + (bytes[24..26] as 24-bit LE)
      const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return { width, height };
    }
    // VP8L (lossless)
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x4C) {
      if (bytes.length < 25) return null;
      // Signature byte at 21 must be 0x2F
      if (bytes[21] !== 0x2F) return null;
      const bits = bytes[22] | (bytes[23] << 8) | (bytes[24] << 16) | (bytes[25] << 24);
      const width = (bits & 0x3FFF) + 1;
      const height = ((bits >> 14) & 0x3FFF) + 1;
      return { width, height };
    }
    // VP8 (lossy)
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x20) {
      // Frame header starts at offset 20, skip 3 bytes of frame tag + 3 bytes of start code
      if (bytes.length < 30) return null;
      const offset = 26; // 20 (chunk data start) + 3 (frame tag) + 3 (start code 9D 01 2A)
      // Verify start code
      if (bytes[23] !== 0x9D || bytes[24] !== 0x01 || bytes[25] !== 0x2A) return null;
      const view = new DataView(buffer);
      const width = view.getUint16(offset, true) & 0x3FFF;
      const height = view.getUint16(offset + 2, true) & 0x3FFF;
      return { width, height };
    }
  }

  // ── JPEG ──
  // Signature: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    const view = new DataView(buffer);
    let offset = 2;
    while (offset < bytes.length - 1) {
      if (bytes[offset] !== 0xFF) break;
      const marker = bytes[offset + 1];

      // Skip padding 0xFF bytes
      if (marker === 0xFF) { offset++; continue; }
      // End of image
      if (marker === 0xD9) break;
      // Markers without length (standalone markers)
      if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD7) || marker === 0x01) {
        offset += 2;
        continue;
      }

      if (offset + 4 > bytes.length) break;
      const segmentLength = view.getUint16(offset + 2, false);

      // SOF markers (Start Of Frame) contain dimensions
      // SOF0=C0, SOF1=C1, SOF2=C2, SOF3=C3, SOF5=C5, SOF6=C6, SOF7=C7,
      // SOF9=C9, SOF10=CA, SOF11=CB, SOF13=CD, SOF14=CE, SOF15=CF
      if (
        (marker >= 0xC0 && marker <= 0xC3) ||
        (marker >= 0xC5 && marker <= 0xC7) ||
        (marker >= 0xC9 && marker <= 0xCB) ||
        (marker >= 0xCD && marker <= 0xCF)
      ) {
        if (offset + 9 > bytes.length) break;
        const height = view.getUint16(offset + 5, false);
        const width = view.getUint16(offset + 7, false);
        if (width > 0 && height > 0) return { width, height };
      }

      offset += 2 + segmentLength;
    }
  }

  return null;
}
