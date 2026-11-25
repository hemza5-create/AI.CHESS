import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export interface StockfishInstalledFileMeta {
  name: string;
  sizeBytes: number;
  sha256: string;
}

export interface StockfishManifest {
  packageVersion: string;
  officialReleaseTag: string | null;
  officialReleaseName: string | null;
  officialReleaseUrl: string;
  officialPublishedAt: string | null;
  wasmScript: string;
  wasmBinary: string | null;
  asmScript: string | null;
  tarballUrl: string;
  tarballIntegrity: string;
  integrityVerified: boolean;
  updatedAt: string;
  source: 'official-auto-update';
  files: StockfishInstalledFileMeta[];
}

export interface StockfishVersionStatus {
  installedVersion: string;
  installedSource: 'official-auto-update' | 'bundled';
  officialReleaseTag: string | null;
  officialReleaseName: string | null;
  officialReleaseUrl: string;
  officialPublishedAt: string | null;
  latestWasmVersion: string | null;
  updateAvailable: boolean;
  wasmScript: string;
  wasmBinary: string | null;
  asmScript: string | null;
  updatedAt: string | null;
  filesCount: number;
  checkError?: string;
}

export interface StockfishUpdateResult {
  ok: true;
  alreadyLatest: boolean;
  manifest: StockfishManifest;
  status: StockfishVersionStatus;
}

const OFFICIAL_GITHUB_RELEASE_URL =
  'https://api.github.com/repos/official-stockfish/Stockfish/releases/latest';
const OFFICIAL_WEBSITE_DOWNLOAD_URL = 'https://stockfishchess.org/download/';
const OFFICIAL_WASM_REGISTRY_URL = 'https://registry.npmjs.org/stockfish/latest';
const OFFICIAL_TARBALL_PREFIX = 'https://registry.npmjs.org/stockfish/-/';

const ALLOWED_METADATA_HOSTS = new Set<string>([
  'api.github.com',
  'stockfishchess.org',
  'registry.npmjs.org',
]);

const MAX_TARBALL_BYTES = 40 * 1024 * 1024;
const MAX_DECOMPRESSED_TAR_BYTES = 110 * 1024 * 1024;
const SAFE_ASSET_FILENAME_REGEX = /^stockfish[\w.-]*\.(?:js|wasm)$/;

export const STOCKFISH_RUNTIME_DIR = path.resolve(process.cwd(), '.stockfish-runtime');
export const STOCKFISH_BUNDLED_BIN_DIR = path.resolve(
  process.cwd(),
  'node_modules/stockfish/bin'
);
const MANIFEST_PATH = path.resolve(STOCKFISH_RUNTIME_DIR, 'manifest.json');

function assertConfinedPath(baseDir: string, candidatePath: string): string {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(candidatePath);
  if (
    resolvedTarget !== resolvedBase &&
    !resolvedTarget.startsWith(resolvedBase + path.sep)
  ) {
    throw new Error('Blocked unsafe path traversal outside engine directory.');
  }
  return resolvedTarget;
}

function assertSafeHttpsUrl(
  rawUrl: string,
  allowedHosts: ReadonlySet<string>,
  requiredPrefix?: string
): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid upstream URL.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS official upstream URLs are permitted.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Credentials in upstream URL are not allowed.');
  }
  if (!allowedHosts.has(parsed.hostname)) {
    throw new Error(`Disallowed upstream host: ${parsed.hostname}`);
  }
  if (requiredPrefix && !parsed.href.startsWith(requiredPrefix)) {
    throw new Error('Upstream URL does not match required official prefix.');
  }
  return parsed;
}

function getBundledPackageVersion(): string {
  try {
    const pkgPath = path.resolve(process.cwd(), 'node_modules/stockfish/package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    return typeof parsed.version === 'string' && parsed.version.trim()
      ? parsed.version.trim()
      : '19.0.1';
  } catch {
    return '19.0.1';
  }
}

export function readInstalledManifest(): StockfishManifest | null {
  try {
    if (!fs.existsSync(MANIFEST_PATH)) return null;
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StockfishManifest>;
    if (
      !parsed ||
      typeof parsed.packageVersion !== 'string' ||
      typeof parsed.wasmScript !== 'string' ||
      !SAFE_ASSET_FILENAME_REGEX.test(parsed.wasmScript)
    ) {
      return null;
    }
    const wasmFilePath = assertConfinedPath(
      STOCKFISH_RUNTIME_DIR,
      path.join(STOCKFISH_RUNTIME_DIR, parsed.wasmScript)
    );
    if (!fs.existsSync(wasmFilePath)) {
      return null;
    }
    return parsed as StockfishManifest;
  } catch {
    return null;
  }
}

export function selectEngineScriptsFromList(filenames: string[]): {
  wasmScript: string;
  wasmBinary: string | null;
  asmScript: string | null;
} {
  const safeFiles = filenames.filter((name) => SAFE_ASSET_FILENAME_REGEX.test(name));
  const jsFiles = safeFiles.filter((name) => name.endsWith('.js'));

  const wasmScript =
    jsFiles.find((n) => /-lite-single\.js$/i.test(n)) ??
    jsFiles.find((n) => /-single\.js$/i.test(n)) ??
    jsFiles.find((n) => !/-asm\.js$/i.test(n) && !/lite\.js$/i.test(n)) ??
    jsFiles.find((n) => !/-asm\.js$/i.test(n)) ??
    'stockfish-19-lite-single.js';

  const expectedWasm = wasmScript.replace(/\.js$/i, '.wasm');
  const wasmBinary = safeFiles.includes(expectedWasm)
    ? expectedWasm
    : safeFiles.find((n) => n.endsWith('.wasm')) ?? null;

  const asmScript =
    jsFiles.find((n) => /-asm\.js$/i.test(n)) ??
    (safeFiles.includes('stockfish-19-asm.js') ? 'stockfish-19-asm.js' : null);

  return { wasmScript, wasmBinary, asmScript };
}

export function resolveStockfishAssetPath(
  requestedName: string
): { filePath: string; cleanName: string; source: 'official-auto-update' | 'bundled' } | null {
  if (!requestedName || typeof requestedName !== 'string') return null;
  const cleanName = path.basename(requestedName);
  if (cleanName !== requestedName || !SAFE_ASSET_FILENAME_REGEX.test(cleanName)) {
    return null;
  }

  try {
    const runtimePath = assertConfinedPath(
      STOCKFISH_RUNTIME_DIR,
      path.join(STOCKFISH_RUNTIME_DIR, cleanName)
    );
    if (fs.existsSync(runtimePath) && fs.statSync(runtimePath).isFile()) {
      return { filePath: runtimePath, cleanName, source: 'official-auto-update' };
    }
  } catch {
    // ignore runtime override error
  }

  try {
    const bundledPath = assertConfinedPath(
      STOCKFISH_BUNDLED_BIN_DIR,
      path.join(STOCKFISH_BUNDLED_BIN_DIR, cleanName)
    );
    if (fs.existsSync(bundledPath) && fs.statSync(bundledPath).isFile()) {
      return { filePath: bundledPath, cleanName, source: 'bundled' };
    }
  } catch {
    // ignore bundled error
  }

  return null;
}

export function getActiveEngineDescriptors(): {
  installedVersion: string;
  installedSource: 'official-auto-update' | 'bundled';
  wasmScript: string;
  wasmBinary: string | null;
  asmScript: string | null;
  nodeEnginePath: string;
  updatedAt: string | null;
  filesCount: number;
  manifest: StockfishManifest | null;
} {
  const manifest = readInstalledManifest();
  if (manifest) {
    const resolved = resolveStockfishAssetPath(manifest.wasmScript);
    if (resolved) {
      return {
        installedVersion: manifest.packageVersion,
        installedSource: 'official-auto-update',
        wasmScript: manifest.wasmScript,
        wasmBinary: manifest.wasmBinary,
        asmScript: manifest.asmScript,
        nodeEnginePath: resolved.filePath,
        updatedAt: manifest.updatedAt,
        filesCount: manifest.files.length,
        manifest,
      };
    }
  }

  let bundledFiles: string[] = [];
  try {
    if (fs.existsSync(STOCKFISH_BUNDLED_BIN_DIR)) {
      bundledFiles = fs.readdirSync(STOCKFISH_BUNDLED_BIN_DIR);
    }
  } catch {
    bundledFiles = [];
  }

  const picked = selectEngineScriptsFromList(bundledFiles);
  const resolvedFallback =
    resolveStockfishAssetPath(picked.wasmScript)?.filePath ??
    path.join(STOCKFISH_BUNDLED_BIN_DIR, 'stockfish-19-lite-single.js');

  return {
    installedVersion: getBundledPackageVersion(),
    installedSource: 'bundled',
    wasmScript: picked.wasmScript,
    wasmBinary: picked.wasmBinary,
    asmScript: picked.asmScript,
    nodeEnginePath: resolvedFallback,
    updatedAt: null,
    filesCount: bundledFiles.filter((f) => SAFE_ASSET_FILENAME_REGEX.test(f)).length,
    manifest: null,
  };
}

function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

async function fetchOfficialGithubRelease(): Promise<{
  tag: string | null;
  name: string | null;
  url: string;
  publishedAt: string | null;
}> {
  const url = assertSafeHttpsUrl(OFFICIAL_GITHUB_RELEASE_URL, ALLOWED_METADATA_HOSTS);
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ChessVision-UCI-Updater/1.0',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(8000),
  });
  if (response.url) {
    assertSafeHttpsUrl(response.url, ALLOWED_METADATA_HOSTS);
  }
  if (!response.ok) {
    throw new Error(`GitHub official release HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    tag_name?: unknown;
    name?: unknown;
    html_url?: unknown;
    published_at?: unknown;
  };
  return {
    tag: typeof data.tag_name === 'string' ? data.tag_name.trim() : null,
    name: typeof data.name === 'string' ? data.name.trim() : null,
    url:
      typeof data.html_url === 'string' &&
      data.html_url.startsWith('https://github.com/official-stockfish/Stockfish/')
        ? data.html_url
        : OFFICIAL_WEBSITE_DOWNLOAD_URL,
    publishedAt: typeof data.published_at === 'string' ? data.published_at : null,
  };
}

async function fetchOfficialWebsiteVersion(): Promise<{
  tag: string | null;
  name: string | null;
  url: string;
}> {
  const url = assertSafeHttpsUrl(OFFICIAL_WEBSITE_DOWNLOAD_URL, ALLOWED_METADATA_HOSTS);
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'ChessVision-UCI-Updater/1.0',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(8000),
  });
  if (response.url) {
    assertSafeHttpsUrl(response.url, ALLOWED_METADATA_HOSTS);
  }
  if (!response.ok) {
    throw new Error(`stockfishchess.org HTTP ${response.status}`);
  }
  const html = await response.text();
  const match = /Stockfish\s+(\d+(?:\.\d+)*)/i.exec(html);
  return {
    tag: match ? `sf_${match[1]}` : null,
    name: match ? `Stockfish ${match[1]}` : null,
    url: OFFICIAL_WEBSITE_DOWNLOAD_URL,
  };
}

interface OfficialWasmPackageMeta {
  version: string;
  tarballUrl: string;
  shasum: string | null;
  integrity: string | null;
}

async function fetchOfficialWasmPackageMeta(): Promise<OfficialWasmPackageMeta> {
  const url = assertSafeHttpsUrl(OFFICIAL_WASM_REGISTRY_URL, ALLOWED_METADATA_HOSTS);
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'ChessVision-UCI-Updater/1.0',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error(`Official WASM registry HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    version?: unknown;
    dist?: {
      tarball?: unknown;
      shasum?: unknown;
      integrity?: unknown;
    };
  };
  const version = typeof data.version === 'string' ? data.version.trim() : '';
  const tarballUrl = typeof data.dist?.tarball === 'string' ? data.dist.tarball.trim() : '';
  if (!version || !tarballUrl) {
    throw new Error('Official Stockfish WASM metadata is incomplete.');
  }
  assertSafeHttpsUrl(tarballUrl, new Set(['registry.npmjs.org']), OFFICIAL_TARBALL_PREFIX);
  return {
    version,
    tarballUrl,
    shasum: typeof data.dist?.shasum === 'string' ? data.dist.shasum.trim() : null,
    integrity: typeof data.dist?.integrity === 'string' ? data.dist.integrity.trim() : null,
  };
}

async function resolveUpstreamReleaseInfo(): Promise<{
  officialReleaseTag: string | null;
  officialReleaseName: string | null;
  officialReleaseUrl: string;
  officialPublishedAt: string | null;
  wasmMeta: OfficialWasmPackageMeta;
}> {
  const [githubRes, websiteRes, wasmMeta] = await Promise.all([
    fetchOfficialGithubRelease().catch(() => null),
    fetchOfficialWebsiteVersion().catch(() => null),
    fetchOfficialWasmPackageMeta(),
  ]);

  const officialReleaseTag = githubRes?.tag ?? websiteRes?.tag ?? null;
  const officialReleaseName = githubRes?.name ?? websiteRes?.name ?? null;
  const officialReleaseUrl = githubRes?.url ?? websiteRes?.url ?? OFFICIAL_WEBSITE_DOWNLOAD_URL;
  const officialPublishedAt = githubRes?.publishedAt ?? null;

  return {
    officialReleaseTag,
    officialReleaseName,
    officialReleaseUrl,
    officialPublishedAt,
    wasmMeta,
  };
}

export async function checkStockfishOfficialVersion(): Promise<StockfishVersionStatus> {
  const active = getActiveEngineDescriptors();
  try {
    const upstream = await resolveUpstreamReleaseInfo();
    const updateAvailable =
      compareSemver(upstream.wasmMeta.version, active.installedVersion) > 0;

    return {
      installedVersion: active.installedVersion,
      installedSource: active.installedSource,
      officialReleaseTag: upstream.officialReleaseTag,
      officialReleaseName: upstream.officialReleaseName,
      officialReleaseUrl: upstream.officialReleaseUrl,
      officialPublishedAt: upstream.officialPublishedAt,
      latestWasmVersion: upstream.wasmMeta.version,
      updateAvailable,
      wasmScript: active.wasmScript,
      wasmBinary: active.wasmBinary,
      asmScript: active.asmScript,
      updatedAt: active.updatedAt,
      filesCount: active.filesCount,
    };
  } catch (err) {
    return {
      installedVersion: active.installedVersion,
      installedSource: active.installedSource,
      officialReleaseTag: active.manifest?.officialReleaseTag ?? null,
      officialReleaseName: active.manifest?.officialReleaseName ?? null,
      officialReleaseUrl: active.manifest?.officialReleaseUrl ?? OFFICIAL_WEBSITE_DOWNLOAD_URL,
      officialPublishedAt: active.manifest?.officialPublishedAt ?? null,
      latestWasmVersion: null,
      updateAvailable: false,
      wasmScript: active.wasmScript,
      wasmBinary: active.wasmBinary,
      asmScript: active.asmScript,
      updatedAt: active.updatedAt,
      filesCount: active.filesCount,
      checkError: err instanceof Error ? err.message : 'Failed to check official release.',
    };
  }
}

async function downloadOfficialTarballVerified(meta: OfficialWasmPackageMeta): Promise<Buffer> {
  const safeTarUrl = assertSafeHttpsUrl(
    meta.tarballUrl,
    new Set(['registry.npmjs.org']),
    OFFICIAL_TARBALL_PREFIX
  );

  const response = await fetch(safeTarUrl, {
    headers: { 'User-Agent': 'ChessVision-UCI-Updater/1.0' },
    redirect: 'error',
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok) {
    throw new Error(`Failed to download Stockfish package (HTTP ${response.status}).`);
  }

  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_TARBALL_BYTES) {
    throw new Error('Downloaded Stockfish archive exceeds maximum allowed size.');
  }

  if (!response.body) {
    throw new Error('Empty response stream from official package registry.');
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_TARBALL_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error('Stockfish download aborted: archive exceeds size ceiling.');
    }
    chunks.push(Buffer.from(value));
  }

  const archiveBuffer = Buffer.concat(chunks, total);
  if (archiveBuffer.length < 1024) {
    throw new Error('Downloaded Stockfish archive is unexpectedly small.');
  }

  // Verify cryptographic integrity (SHA-512 SRI and/or SHA-1 shasum)
  let verified = false;
  if (meta.integrity && meta.integrity.startsWith('sha512-')) {
    const expectedB64 = meta.integrity.slice('sha512-'.length).trim();
    const actualB64 = crypto.createHash('sha512').update(archiveBuffer).digest('base64');
    const a = Buffer.from(expectedB64, 'utf8');
    const b = Buffer.from(actualB64, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new Error('Stockfish archive failed SHA-512 integrity verification.');
    }
    verified = true;
  }

  if (meta.shasum) {
    const actualSha1 = crypto.createHash('sha1').update(archiveBuffer).digest('hex');
    const a = Buffer.from(meta.shasum.toLowerCase(), 'utf8');
    const b = Buffer.from(actualSha1.toLowerCase(), 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new Error('Stockfish archive failed SHA-1 checksum verification.');
    }
    verified = true;
  }

  if (!verified) {
    throw new Error('Official package metadata lacks cryptographic integrity hash.');
  }

  return archiveBuffer;
}

function readTarString(block: Buffer, start: number, length: number): string {
  const slice = block.subarray(start, start + length);
  const zeroIdx = slice.indexOf(0);
  const trimmed = zeroIdx === -1 ? slice : slice.subarray(0, zeroIdx);
  return trimmed.toString('utf8');
}

function readTarOctal(block: Buffer, start: number, length: number): number {
  const raw = readTarString(block, start, length).trim().replace(/\0/g, '');
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 8);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Invalid octal size inside Stockfish tar archive.');
  }
  return parsed;
}

function extractSafeEngineBinariesFromTgz(
  tgzBuffer: Buffer
): Map<string, Buffer> {
  const tarBuffer = zlib.gunzipSync(tgzBuffer, {
    maxOutputLength: MAX_DECOMPRESSED_TAR_BYTES,
  });

  const extracted = new Map<string, Buffer>();
  let offset = 0;

  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + 512);
    offset += 512;

    // Two zero-filled blocks mark end of tar archive
    if (header.every((byte) => byte === 0)) {
      break;
    }

    const namePart = readTarString(header, 0, 100);
    const prefixPart = readTarString(header, 345, 155);
    const entryPath = prefixPart ? `${prefixPart}/${namePart}` : namePart;
    const size = readTarOctal(header, 124, 12);
    const typeFlag = String.fromCharCode(header[156] || 48);

    // Block symlinks ('2') and hardlinks ('1') explicitly
    if (typeFlag === '1' || typeFlag === '2') {
      throw new Error('Blocked unsafe link entry inside Stockfish archive.');
    }

    if (offset + size > tarBuffer.length) {
      throw new Error('Truncated tar entry inside Stockfish archive.');
    }

    const dataSlice = tarBuffer.subarray(offset, offset + size);
    const paddedBlocks = Math.ceil(size / 512) * 512;
    offset += paddedBlocks;

    // Skip non-regular metadata headers (directories '5', PAX 'x'/'g', etc.)
    if (typeFlag !== '0' && typeFlag !== '\0') {
      continue;
    }

    const normalized = entryPath.replace(/^\.\//, '');
    if (normalized.includes('..') || normalized.startsWith('/')) {
      throw new Error('Blocked path traversal entry inside Stockfish archive.');
    }

    const binMatch = /^package\/bin\/([^/]+)$/.exec(normalized);
    if (!binMatch) continue;

    const baseName = binMatch[1];
    if (!SAFE_ASSET_FILENAME_REGEX.test(baseName)) continue;

    extracted.set(baseName, Buffer.from(dataSlice));
  }

  return extracted;
}

export async function performStockfishAutoUpdate(): Promise<StockfishUpdateResult> {
  const upstream = await resolveUpstreamReleaseInfo();
  const tgzBuffer = await downloadOfficialTarballVerified(upstream.wasmMeta);
  const extractedFiles = extractSafeEngineBinariesFromTgz(tgzBuffer);

  if (extractedFiles.size === 0) {
    throw new Error('No valid Stockfish .js/.wasm engine files found in official archive.');
  }

  const picked = selectEngineScriptsFromList(Array.from(extractedFiles.keys()));
  if (!picked.wasmScript || !extractedFiles.has(picked.wasmScript)) {
    throw new Error('Official archive did not include a supported single-thread Stockfish script.');
  }

  fs.mkdirSync(STOCKFISH_RUNTIME_DIR, { recursive: true });
  const stageDir = assertConfinedPath(
    STOCKFISH_RUNTIME_DIR,
    path.join(STOCKFISH_RUNTIME_DIR, `.stage-${Date.now()}`)
  );
  fs.mkdirSync(stageDir, { recursive: true });

  const installedMeta: StockfishInstalledFileMeta[] = [];

  try {
    for (const [fileName, contents] of extractedFiles.entries()) {
      if (!SAFE_ASSET_FILENAME_REGEX.test(fileName)) continue;
      const stageFile = assertConfinedPath(stageDir, path.join(stageDir, fileName));
      fs.writeFileSync(stageFile, contents);
      const sha256 = crypto.createHash('sha256').update(contents).digest('hex');
      installedMeta.push({
        name: fileName,
        sizeBytes: contents.length,
        sha256,
      });
    }

    // Atomically move verified staged binaries into STOCKFISH_RUNTIME_DIR
    for (const item of installedMeta) {
      const srcFile = assertConfinedPath(stageDir, path.join(stageDir, item.name));
      const destFile = assertConfinedPath(
        STOCKFISH_RUNTIME_DIR,
        path.join(STOCKFISH_RUNTIME_DIR, item.name)
      );
      fs.renameSync(srcFile, destFile);
    }
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }

  // Remove stale engine files no longer present in the new release
  const installedNames = new Set(installedMeta.map((f) => f.name));
  for (const existing of fs.readdirSync(STOCKFISH_RUNTIME_DIR)) {
    if (SAFE_ASSET_FILENAME_REGEX.test(existing) && !installedNames.has(existing)) {
      const obsoletePath = assertConfinedPath(
        STOCKFISH_RUNTIME_DIR,
        path.join(STOCKFISH_RUNTIME_DIR, existing)
      );
      fs.rmSync(obsoletePath, { force: true });
    }
  }

  const manifest: StockfishManifest = {
    packageVersion: upstream.wasmMeta.version,
    officialReleaseTag: upstream.officialReleaseTag,
    officialReleaseName: upstream.officialReleaseName,
    officialReleaseUrl: upstream.officialReleaseUrl,
    officialPublishedAt: upstream.officialPublishedAt,
    wasmScript: picked.wasmScript,
    wasmBinary: picked.wasmBinary,
    asmScript: picked.asmScript,
    tarballUrl: upstream.wasmMeta.tarballUrl,
    tarballIntegrity:
      upstream.wasmMeta.integrity ?? `sha1-${upstream.wasmMeta.shasum ?? 'verified'}`,
    integrityVerified: true,
    updatedAt: new Date().toISOString(),
    source: 'official-auto-update',
    files: installedMeta.sort((a, b) => a.name.localeCompare(b.name)),
  };

  const manifestTmp = assertConfinedPath(
    STOCKFISH_RUNTIME_DIR,
    path.join(STOCKFISH_RUNTIME_DIR, `.manifest-${Date.now()}.json`)
  );
  fs.writeFileSync(manifestTmp, JSON.stringify(manifest, null, 2), 'utf8');
  fs.renameSync(manifestTmp, MANIFEST_PATH);

  const status = await checkStockfishOfficialVersion();
  return {
    ok: true,
    alreadyLatest: false,
    manifest,
    status,
  };
}
