/**
 * mobile/scripts/generate-assets.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Script automatizado usando la librería sharp para generar todos los assets
 * de íconos y splash screen para TikiTaka WC2026.
 */

const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const SOURCE_IMAGE = 'C:/Users/saled/.gemini/antigravity-ide/brain/3948d68c-e1b8-47ed-b607-a24dfad7cff3/media__1780016679841.jpg';
const TARGET_DIR   = path.join(__dirname, '../assets/images');

async function generateAssets() {
  console.log('🖼️ Iniciando generación de assets de imagen para TikiTaka...');
  console.log(`Source: ${SOURCE_IMAGE}`);
  console.log(`Target: ${TARGET_DIR}`);

  if (!fs.existsSync(SOURCE_IMAGE)) {
    console.error(`❌ Error: El archivo origen no existe en ${SOURCE_IMAGE}`);
    process.exit(1);
  }

  // Asegurar que la carpeta destino existe
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  try {
    // 1. icon.png (1024x1024)
    console.log('🚀 Generando icon.png (1024x1024)...');
    await sharp(SOURCE_IMAGE)
      .resize(1024, 1024, { fit: 'cover' })
      .toFile(path.join(TARGET_DIR, 'icon.png'));
    console.log('✅ icon.png generado.');

    // 2. android-icon-foreground.png (1024x1024 con 25% de padding para safe-zone)
    // Redimensionamos a 600x600 px y rellenamos 212px transparentes a cada lado (600 + 212*2 = 1024)
    console.log('🚀 Generando android-icon-foreground.png (1024x1024 con padding)...');
    await sharp(SOURCE_IMAGE)
      .resize(600, 600, { fit: 'contain' })
      .extend({
        top: 212,
        bottom: 212,
        left: 212,
        right: 212,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .toFile(path.join(TARGET_DIR, 'android-icon-foreground.png'));
    console.log('✅ android-icon-foreground.png generado.');

    // 3. android-icon-background.png (1024x1024 fondo negro sólido #000000)
    console.log('🚀 Generando android-icon-background.png (1024x1024 solid black)...');
    await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 }
      }
    })
    .png()
    .toFile(path.join(TARGET_DIR, 'android-icon-background.png'));
    console.log('✅ android-icon-background.png generado.');

    // 4. splash-icon.png (200x200)
    console.log('🚀 Generando splash-icon.png (200x200)...');
    await sharp(SOURCE_IMAGE)
      .resize(200, 200, { fit: 'cover' })
      .toFile(path.join(TARGET_DIR, 'splash-icon.png'));
    console.log('✅ splash-icon.png generado.');

    // 5. favicon.png (48x48)
    console.log('🚀 Generando favicon.png (48x48)...');
    await sharp(SOURCE_IMAGE)
      .resize(48, 48, { fit: 'cover' })
      .toFile(path.join(TARGET_DIR, 'favicon.png'));
    console.log('✅ favicon.png generado.');

    console.log('\n🎉 ¡Todos los assets han sido generados exitosamente en assets/images/!');
  } catch (error) {
    console.error('❌ Error durante la generación de assets:', error);
    process.exit(1);
  }
}

generateAssets();
