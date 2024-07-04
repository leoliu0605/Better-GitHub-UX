const sharp = require('sharp');

const sizes = [16, 48, 128];

async function convertIcons() {
  for (const size of sizes) {
    await sharp('icon.svg')
      .resize(size, size)
      .png()
      .toFile(`icons/icon${size}.png`);
    console.log(`Created ${size}x${size} icon`);
  }
}

convertIcons().catch(console.error); 