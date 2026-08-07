#!/usr/bin/env node

/**
 * Icon generation script for BlockBuilder Electron app.
 * Requires: sharp for PNG generation, icongen for ICNS generation
 *
 * Usage: npm install sharp icongen && npm run generate-icons
 */

const fs = require("fs");
const path = require("path");

async function generateIcons() {
  try {
    // Try to use sharp for PNG generation
    let sharp;
    try {
      sharp = require("sharp");
    } catch (e) {
      console.log("sharp not installed, skipping PNG generation");
      console.log("Install it with: npm install --save-dev sharp");
      return;
    }

    const buildDir = __dirname + "/build";
    const svgPath = path.join(buildDir, "icon.svg");
    const pngPath = path.join(buildDir, "icon.png");

    if (!fs.existsSync(svgPath)) {
      console.error(`SVG icon not found at ${svgPath}`);
      process.exit(1);
    }

    // Generate PNG from SVG (256x256 for Electron)
    console.log("Generating icon.png (256x256)...");
    await sharp(svgPath)
      .resize(256, 256, { fit: "cover" })
      .png()
      .toFile(pngPath);
    console.log(`✓ Created ${pngPath}`);

    // For macOS ICNS, we need multiple sizes
    console.log("Generating icon sizes for ICNS...");
    const iconSizes = [16, 32, 64, 128, 256, 512];
    const tempDir = path.join(buildDir, ".icns-temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    for (const size of iconSizes) {
      const sizeFile = path.join(tempDir, `icon_${size}x${size}.png`);
      await sharp(svgPath)
        .resize(size, size, { fit: "cover" })
        .png()
        .toFile(sizeFile);
      console.log(`  ✓ ${size}x${size}`);
    }

    // Try to generate ICNS using icongen if available
    try {
      const icongen = require("icongen");
      console.log("Generating icon.icns for macOS...");
      const icnsPath = path.join(buildDir, "icon.icns");

      // Create a simple ICNS from PNG using system tools if available
      const { execSync } = require("child_process");
      try {
        // Use sips on macOS if available
        execSync(`sips -s format icns ${pngPath} -o ${icnsPath}`, { stdio: "pipe" });
        console.log(`✓ Created ${icnsPath}`);
      } catch (e) {
        console.log("Note: Could not generate .icns file. Use icon.png instead.");
        console.log("On macOS, you can generate it manually with: sips -s format icns icon.png -o icon.icns");
      }
    } catch (e) {
      console.log("Note: icongen not installed. ICNS generation skipped.");
      console.log("On macOS, you can generate .icns from PNG:");
      console.log("  sips -s format icns icon.png -o icon.icns");
    }

    // Cleanup
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }

    console.log("\n✓ Icon generation complete!");
    console.log(`  PNG: ${pngPath}`);
    console.log(`  For .icns on macOS, run: sips -s format icns ${pngPath} -o ${buildDir}/icon.icns`);
  } catch (error) {
    console.error("Error generating icons:", error.message);
    process.exit(1);
  }
}

generateIcons();
