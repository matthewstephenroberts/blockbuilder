#!/bin/bash

# Icon setup script for BlockBuilder Electron app
# Creates PNG and ICNS icons from the SVG source

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
SVG_FILE="$BUILD_DIR/icon.svg"
PNG_FILE="$BUILD_DIR/icon.png"
ICNS_FILE="$BUILD_DIR/icon.icns"

echo "🎨 Setting up BlockBuilder icons..."

# Check if SVG exists
if [ ! -f "$SVG_FILE" ]; then
  echo "❌ SVG icon not found: $SVG_FILE"
  exit 1
fi

echo "📝 Creating icons..."

# Create a simple blue PNG placeholder using Python
python3 << 'PYTHON_PLACEHOLDER'
import struct
import zlib
import sys

# Create a simple blue brick-themed PNG (256x256)
width, height = 256, 256
pixel_data = []

# Create brick pattern background
for y in range(height):
  for x in range(width):
    # Create brick pattern
    brick_x = x // 64
    brick_y = y // 64
    if (brick_x + brick_y) % 2 == 0:
      r, g, b = 60, 165, 245  # Light blue (#3ca5f5)
    else:
      r, g, b = 48, 130, 246  # Medium blue (#3082f6)
    pixel_data.append(bytes([r, g, b]))

# Convert to PNG
def create_png(width, height, pixels, output_path):
  png_data = b'\x89PNG\r\n\x1a\n'  # PNG signature

  # IHDR chunk (13 bytes)
  ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)  # 8-bit RGB
  ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data) & 0xffffffff
  png_data += struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)

  # IDAT chunk (compressed image data)
  raw_data = b''
  for y in range(height):
    raw_data += b'\x00'  # Filter type for this scanline
    for x in range(width):
      pixel = pixels[y * width + x]
      raw_data += pixel

  compressed = zlib.compress(raw_data, 9)
  idat_crc = zlib.crc32(b'IDAT' + compressed) & 0xffffffff
  png_data += struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc)

  # IEND chunk
  iend_crc = zlib.crc32(b'IEND') & 0xffffffff
  png_data += struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)

  with open(output_path, 'wb') as f:
    f.write(png_data)
  print(f"✓ Created PNG: {output_path}")

create_png(width, height, pixel_data, sys.argv[1])
PYTHON_PLACEHOLDER

# Use the output path from the script variable
python3 - "$PNG_FILE" << 'PYTHON_PLACEHOLDER'
import struct
import zlib
import sys

output_path = sys.argv[1]

# Create a simple blue brick-themed PNG (256x256)
width, height = 256, 256
pixel_data = []

# Create brick pattern background
for y in range(height):
  for x in range(width):
    # Create brick pattern
    brick_x = x // 64
    brick_y = y // 64
    if (brick_x + brick_y) % 2 == 0:
      r, g, b = 60, 165, 245  # Light blue (#3ca5f5)
    else:
      r, g, b = 48, 130, 246  # Medium blue (#3082f6)
    pixel_data.append(bytes([r, g, b]))

# Convert to PNG
png_data = b'\x89PNG\r\n\x1a\n'  # PNG signature

# IHDR chunk (13 bytes)
ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)  # 8-bit RGB
ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data) & 0xffffffff
png_data += struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)

# IDAT chunk (compressed image data)
raw_data = b''
for y in range(height):
  raw_data += b'\x00'  # Filter type for this scanline
  for x in range(width):
    pixel = pixel_data[y * width + x]
    raw_data += pixel

compressed = zlib.compress(raw_data, 9)
idat_crc = zlib.crc32(b'IDAT' + compressed) & 0xffffffff
png_data += struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc)

# IEND chunk
iend_crc = zlib.crc32(b'IEND') & 0xffffffff
png_data += struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)

with open(output_path, 'wb') as f:
  f.write(png_data)
print(f"✓ Created PNG: {output_path}")
PYTHON_PLACEHOLDER

# Create ICNS from PNG using sips
if [ -f "$PNG_FILE" ]; then
  echo "📦 Creating ICNS from PNG..."
  sips -s format icns "$PNG_FILE" -o "$ICNS_FILE" 2>&1
  if [ -f "$ICNS_FILE" ]; then
    echo "✓ Created ICNS: $ICNS_FILE"
  else
    echo "⚠ Warning: Could not create ICNS file"
  fi
else
  echo "❌ Could not create PNG"
  exit 1
fi

echo ""
echo "✅ Icon setup complete!"
if [ -f "$PNG_FILE" ]; then
  echo "   PNG:  $PNG_FILE"
fi
if [ -f "$ICNS_FILE" ]; then
  echo "   ICNS: $ICNS_FILE"
fi
