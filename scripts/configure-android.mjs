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
  '<uses-permission android:name="android.permission.VIDEO_CAPTURE" />',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
  '<uses-feature android:name="android.hardware.camera.any" android:required="false" />',
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

// 2. Patch MainActivity.java or MainActivity.kt to bridge WebView PermissionRequest + runtime CAMERA permission
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
  if (!javaSrc.includes('BridgeWebChromeClient')) {
    const importsBlock = [
      'import android.Manifest;',
      'import android.content.pm.PackageManager;',
      'import android.os.Bundle;',
      'import android.webkit.PermissionRequest;',
      'import androidx.annotation.NonNull;',
      'import androidx.core.app.ActivityCompat;',
      'import androidx.core.content.ContextCompat;',
      'import com.getcapacitor.BridgeWebChromeClient;',
      'import java.util.ArrayList;',
      'import java.util.List;',
    ].join('\n');

    javaSrc = javaSrc.replace(
      'import com.getcapacitor.BridgeActivity;',
      `import com.getcapacitor.BridgeActivity;\n${importsBlock}`
    );

    const onCreateBody = `
    private static final int WEB_MEDIA_PERMISSION_REQUEST_CODE = 1001;
    private PermissionRequest pendingWebPermissionRequest;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{ Manifest.permission.CAMERA }, WEB_MEDIA_PERMISSION_REQUEST_CODE);
        }

        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(() -> {
                        List<String> neededOsPermissions = new ArrayList<>();
                        for (String res : request.getResources()) {
                            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)
                                    && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                                neededOsPermissions.add(Manifest.permission.CAMERA);
                            }
                            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)
                                    && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                                neededOsPermissions.add(Manifest.permission.RECORD_AUDIO);
                            }
                        }

                        if (neededOsPermissions.isEmpty()) {
                            request.grant(request.getResources());
                        } else {
                            pendingWebPermissionRequest = request;
                            ActivityCompat.requestPermissions(
                                MainActivity.this,
                                neededOsPermissions.toArray(new String[0]),
                                WEB_MEDIA_PERMISSION_REQUEST_CODE
                            );
                        }
                    });
                }

                @Override
                public void onPermissionRequestCanceled(PermissionRequest request) {
                    super.onPermissionRequestCanceled(request);
                    if (pendingWebPermissionRequest == request) {
                        pendingWebPermissionRequest = null;
                    }
                }
            });
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == WEB_MEDIA_PERMISSION_REQUEST_CODE && pendingWebPermissionRequest != null) {
            final PermissionRequest req = pendingWebPermissionRequest;
            pendingWebPermissionRequest = null;
            boolean allGranted = grantResults.length > 0;
            for (int result : grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }
            final boolean granted = allGranted;
            runOnUiThread(() -> {
                if (granted) {
                    req.grant(req.getResources());
                } else {
                    req.deny();
                }
            });
        }
    }
`;
    javaSrc = javaSrc.replace(
      /public class MainActivity extends BridgeActivity\s*\{/,
      `public class MainActivity extends BridgeActivity {\n${onCreateBody}`
    );
    fs.writeFileSync(mainActivityPath, javaSrc, 'utf8');
    console.log(`[configure-android] Patched ${mainActivityPath} with BridgeWebChromeClient & CAMERA permission`);
  }
} else if (mainActivityPath && mainActivityPath.endsWith('.kt')) {
  let ktSrc = fs.readFileSync(mainActivityPath, 'utf8');
  if (!ktSrc.includes('BridgeWebChromeClient')) {
    const importsBlock = [
      'import android.Manifest',
      'import android.content.pm.PackageManager',
      'import android.os.Bundle',
      'import android.webkit.PermissionRequest',
      'import androidx.core.app.ActivityCompat',
      'import androidx.core.content.ContextCompat',
      'import com.getcapacitor.BridgeWebChromeClient',
    ].join('\n');

    ktSrc = ktSrc.replace(
      'import com.getcapacitor.BridgeActivity',
      `import com.getcapacitor.BridgeActivity\n${importsBlock}`
    );

    const onCreateBody = `
    private val webMediaPermissionRequestCode = 1001
    private var pendingWebPermissionRequest: PermissionRequest? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), webMediaPermissionRequestCode)
        }

        bridge?.webView?.webChromeClient = object : BridgeWebChromeClient(bridge) {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val needed = mutableListOf<String>()
                    for (res in request.resources) {
                        if (res == PermissionRequest.RESOURCE_VIDEO_CAPTURE &&
                            ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED
                        ) {
                            needed.add(Manifest.permission.CAMERA)
                        }
                        if (res == PermissionRequest.RESOURCE_AUDIO_CAPTURE &&
                            ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED
                        ) {
                            needed.add(Manifest.permission.RECORD_AUDIO)
                        }
                    }
                    if (needed.isEmpty()) {
                        request.grant(request.resources)
                    } else {
                        pendingWebPermissionRequest = request
                        ActivityCompat.requestPermissions(this@MainActivity, needed.toTypedArray(), webMediaPermissionRequestCode)
                    }
                }
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest) {
                super.onPermissionRequestCanceled(request)
                if (pendingWebPermissionRequest == request) {
                    pendingWebPermissionRequest = null
                }
            }
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == webMediaPermissionRequestCode) {
            val req = pendingWebPermissionRequest ?: return
            pendingWebPermissionRequest = null
            val allGranted = grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }
            runOnUiThread {
                if (allGranted) req.grant(req.resources) else req.deny()
            }
        }
    }
`;
    ktSrc = ktSrc.replace(
      /class MainActivity\s*:\s*BridgeActivity\(\)\s*\{/,
      `class MainActivity : BridgeActivity() {\n${onCreateBody}`
    );
    fs.writeFileSync(mainActivityPath, ktSrc, 'utf8');
    console.log(`[configure-android] Patched ${mainActivityPath} with BridgeWebChromeClient & CAMERA permission`);
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

// 4. Sync Android versionName & versionCode from package.json so APK upgrades cleanly
const pkgPath = path.join(rootDir, 'package.json');
const gradleGroovyPath = path.join(rootDir, 'android', 'app', 'build.gradle');
const gradleKtsPath = path.join(rootDir, 'android', 'app', 'build.gradle.kts');
const targetGradlePath = fs.existsSync(gradleGroovyPath)
  ? gradleGroovyPath
  : fs.existsSync(gradleKtsPath)
  ? gradleKtsPath
  : null;

if (fs.existsSync(pkgPath) && targetGradlePath) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const rawVersion = typeof pkg.version === 'string' ? pkg.version.trim() : '';
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(rawVersion);
  if (match) {
    const major = Number(match[1]);
    const minor = Number(match[2]);
    const patch = Number(match[3]);
    const versionCode = major * 10000 + minor * 100 + patch;
    let gradleSrc = fs.readFileSync(targetGradlePath, 'utf8');
    gradleSrc = gradleSrc
      .replace(/\bversionCode\s*=?\s*\d+/, (m) =>
        m.includes('=') ? `versionCode = ${versionCode}` : `versionCode ${versionCode}`
      )
      .replace(/\bversionName\s*=?\s*["'][^"']+["']/, (m) =>
        m.includes('=') ? `versionName = "${rawVersion}"` : `versionName "${rawVersion}"`
      );
    fs.writeFileSync(targetGradlePath, gradleSrc, 'utf8');
    console.log(
      `[configure-android] Synced ${path.basename(targetGradlePath)} to versionName="${rawVersion}" (versionCode=${versionCode})`
    );
  }
}

