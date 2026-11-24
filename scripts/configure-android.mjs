import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const androidMainDir = path.join(rootDir, 'android', 'app', 'src', 'main');
const manifestPath = path.join(androidMainDir, 'AndroidManifest.xml');

if (!fs.existsSync(manifestPath)) {
  console.warn('[configure-android] AndroidManifest.xml not found, skipping.');
  process.exit(0);
}

// 1. Ensure CAMERA & media permissions exist in AndroidManifest.xml
let manifest = fs.readFileSync(manifestPath, 'utf8');

const manifestAdditions = [
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
  '<uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />',
];

const missingLines = manifestAdditions.filter((line) => {
  const nameMatch = /android:name="([^"]+)"/.exec(line);
  return nameMatch ? !manifest.includes(nameMatch[1]) : false;
});

if (missingLines.length > 0) {
  manifest = manifest.replace(
    /<application\b/,
    `${missingLines.map((l) => `    ${l}`).join('\n')}\n\n    <application`
  );
  fs.writeFileSync(manifestPath, manifest, 'utf8');
  console.log('[configure-android] Added CAMERA permissions & features to AndroidManifest.xml');
}

// 2. Patch MainActivity.java or MainActivity.kt to request runtime CAMERA permission cleanly
const javaBaseDir = path.join(androidMainDir, 'java');
function findMainActivity(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findMainActivity(full);
      if (found) return found;
    } else if (entry.name === 'MainActivity.java' || entry.name === 'MainActivity.kt') {
      return full;
    }
  }
  return null;
}

const mainActivityPath = findMainActivity(javaBaseDir);
if (mainActivityPath && mainActivityPath.endsWith('.java')) {
  let javaSrc = fs.readFileSync(mainActivityPath, 'utf8');
  if (!javaSrc.includes('Manifest.permission.CAMERA')) {
    const importsBlock = [
      'import android.Manifest;',
      'import android.content.pm.PackageManager;',
      'import android.os.Build;',
      'import android.os.Bundle;',
    ].join('\n');

    javaSrc = javaSrc.replace(
      'import com.getcapacitor.BridgeActivity;',
      `import com.getcapacitor.BridgeActivity;\n${importsBlock}`
    );

    const onCreateBody = `
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{ Manifest.permission.CAMERA }, 1001);
        }
    }
`;
    javaSrc = javaSrc.replace(
      /public class MainActivity extends BridgeActivity\s*\{/,
      `public class MainActivity extends BridgeActivity {\n${onCreateBody}`
    );
    fs.writeFileSync(mainActivityPath, javaSrc, 'utf8');
    console.log(`[configure-android] Patched ${mainActivityPath} for runtime CAMERA permission`);
  }
} else if (mainActivityPath && mainActivityPath.endsWith('.kt')) {
  let ktSrc = fs.readFileSync(mainActivityPath, 'utf8');
  if (!ktSrc.includes('Manifest.permission.CAMERA')) {
    const importsBlock = [
      'import android.Manifest',
      'import android.content.pm.PackageManager',
      'import android.os.Build',
      'import android.os.Bundle',
    ].join('\n');

    ktSrc = ktSrc.replace(
      'import com.getcapacitor.BridgeActivity',
      `import com.getcapacitor.BridgeActivity\n${importsBlock}`
    );

    const onCreateBody = `
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
            checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.CAMERA), 1001)
        }
    }
`;
    ktSrc = ktSrc.replace(
      /class MainActivity\s*:\s*BridgeActivity\(\)\s*\{/,
      `class MainActivity : BridgeActivity() {\n${onCreateBody}`
    );
    fs.writeFileSync(mainActivityPath, ktSrc, 'utf8');
    console.log(`[configure-android] Patched ${mainActivityPath} for runtime CAMERA permission`);
  }
}

// 3. Replace Android Adaptive Icons (API 26+) & legacy mipmap launcher icons
const resDir = path.join(androidMainDir, 'res');
const icon512 = path.join(rootDir, 'public', 'pwa-512x512.png');
const icon192 = path.join(rootDir, 'public', 'pwa-192x192.png');
const maskable512 = path.join(rootDir, 'public', 'pwa-maskable-512x512.png');
const bg512 = path.join(rootDir, 'public', 'android-icon-bg.png');

if (fs.existsSync(resDir) && fs.existsSync(icon512) && fs.existsSync(icon192)) {
  // Remove Capacitor's default vector/XML foreground/background drawables so mipmap PNGs take precedence
  for (const entry of fs.readdirSync(resDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('drawable')) {
      const drawableDir = path.join(resDir, entry.name);
      for (const file of fs.readdirSync(drawableDir)) {
        if (
          file.startsWith('ic_launcher_foreground') ||
          file.startsWith('ic_launcher_background')
        ) {
          fs.rmSync(path.join(drawableDir, file), { force: true });
        }
      }
    }
  }

  // Write mipmap icons across all density buckets
  const densities = [
    { dir: 'mipmap-mdpi', legacy: icon192 },
    { dir: 'mipmap-hdpi', legacy: icon192 },
    { dir: 'mipmap-xhdpi', legacy: icon192 },
    { dir: 'mipmap-xxhdpi', legacy: icon512 },
    { dir: 'mipmap-xxxhdpi', legacy: icon512 },
  ];

  const fgSource = fs.existsSync(maskable512) ? maskable512 : icon512;
  const bgSource = fs.existsSync(bg512) ? bg512 : icon512;

  for (const { dir, legacy } of densities) {
    const targetDir = path.join(resDir, dir);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(legacy, path.join(targetDir, 'ic_launcher.png'));
    fs.copyFileSync(legacy, path.join(targetDir, 'ic_launcher_round.png'));
    fs.copyFileSync(fgSource, path.join(targetDir, 'ic_launcher_foreground.png'));
    fs.copyFileSync(bgSource, path.join(targetDir, 'ic_launcher_background.png'));
  }

  // Ensure API 26+ adaptive icon XMLs point to our mipmap background & foreground
  const anyDpiDir = path.join(resDir, 'mipmap-anydpi-v26');
  fs.mkdirSync(anyDpiDir, { recursive: true });
  const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
  fs.writeFileSync(path.join(anyDpiDir, 'ic_launcher.xml'), adaptiveXml, 'utf8');
  fs.writeFileSync(path.join(anyDpiDir, 'ic_launcher_round.xml'), adaptiveXml, 'utf8');

  // Remove ic_launcher_background.xml from values/ if any conflicts exist
  const valuesBgXml = path.join(resDir, 'values', 'ic_launcher_background.xml');
  if (fs.existsSync(valuesBgXml)) {
    fs.writeFileSync(
      valuesBgXml,
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0B0E14</color>\n</resources>\n`,
      'utf8'
    );
  }

  console.log('[configure-android] Replaced Android adaptive & legacy launcher icons');
}
