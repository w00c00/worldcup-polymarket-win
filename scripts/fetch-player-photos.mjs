import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_FILE = path.join(ROOT, "lib/generated/player-data.ts");
const PHOTO_MAP_FILE = path.join(ROOT, "lib/generated/player-photos.ts");
const PUBLIC_DIR = path.join(ROOT, "public/player-photos");
const MANIFEST_FILE = path.join(PUBLIC_DIR, "manifest.json");
const ATTRIBUTION_FILE = path.join(PUBLIC_DIR, "attribution.json");
const USER_AGENT = "worldcup-polymarket-win/1.0 (player photo cache)";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }),
);
const limit = Math.max(1, Number(args.get("limit") ?? 200));
const delayMs = Math.max(0, Number(args.get("delay") ?? 1200));
const retries = Math.max(0, Number(args.get("retries") ?? 2));
const timeoutMs = Math.max(1000, Number(args.get("timeout") ?? 15000));
const force = args.has("force");
const writeTs = !args.has("no-ts");

fs.mkdirSync(PUBLIC_DIR, { recursive: true });

const players = readPlayers().slice(0, limit);
const existingPhotos = readExistingPhotoMap();
const attribution = readJSON(ATTRIBUTION_FILE, {});
const nextPhotos = { ...existingPhotos };

let downloaded = 0;
let reused = 0;
let missed = 0;

for (const player of players) {
  const existing = nextPhotos[player.id];
  if (!force && existing && fs.existsSync(path.join(ROOT, "public", existing.replace(/^\//, "")))) {
    reused += 1;
    continue;
  }

  try {
    const match = await findWikipediaImage(player);
    if (!match) {
      missed += 1;
      console.warn(`miss ${player.name}`);
      continue;
    }
    const localPath = await downloadImage(player.id, match.imageUrl);
    if (!localPath) {
      missed += 1;
      console.warn(`skip ${player.name}: unsupported image`);
      continue;
    }
    nextPhotos[player.id] = localPath;
    attribution[player.id] = {
      name: player.name,
      pageTitle: match.title,
      pageUrl: match.pageUrl,
      sourceUrl: match.imageUrl,
      localPath,
      cachedAt: new Date().toISOString(),
    };
    downloaded += 1;
    console.log(`ok ${player.name} -> ${localPath}`);
  } catch (error) {
    missed += 1;
    console.warn(`fail ${player.name}: ${error instanceof Error ? error.message : String(error)}`);
  }

  await sleep(delayMs);
}

writePhotoMap(nextPhotos);
fs.writeFileSync(ATTRIBUTION_FILE, `${JSON.stringify(attribution, null, 2)}\n`);
console.log(JSON.stringify({ checked: players.length, downloaded, reused, missed, totalCached: Object.keys(nextPhotos).length }, null, 2));

function readPlayers() {
  const text = fs.readFileSync(DATA_FILE, "utf8");
  const marker = "export const GENERATED_PLAYERS = ";
  const start = text.indexOf(marker);
  if (start < 0) throw new Error("player data marker not found");
  const listStart = start + marker.length;
  const listEnd = text.indexOf("] satisfies Player[];", listStart);
  if (listEnd < 0) throw new Error("player data ending not found");
  return JSON.parse(text.slice(listStart, listEnd + 1));
}

function readExistingPhotoMap() {
  const photos = {};
  if (fs.existsSync(PHOTO_MAP_FILE)) {
    const text = fs.readFileSync(PHOTO_MAP_FILE, "utf8");
    const entries = [...text.matchAll(/"([^"]+)":\s*"([^"]+)"/g)];
    Object.assign(photos, Object.fromEntries(entries.map(([, key, value]) => [key, value])));
  }
  for (const file of fs.readdirSync(PUBLIC_DIR)) {
    const match = file.match(/^(.+)\.(jpg|png|webp)$/);
    if (match) photos[match[1]] ??= `/player-photos/${file}`;
  }
  return photos;
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function findWikipediaImage(player) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", `${player.name} footballer`);
  url.searchParams.set("gsrlimit", "6");
  url.searchParams.set("prop", "pageimages|info");
  url.searchParams.set("piprop", "original|thumbnail");
  url.searchParams.set("pithumbsize", "520");
  url.searchParams.set("inprop", "url");
  url.searchParams.set("origin", "*");

  const json = await fetchJSON(url);
  const pages = Object.values(json.query?.pages ?? {})
    .filter((page) => page.original?.source || page.thumbnail?.source)
    .sort((a, b) => scorePage(b, player) - scorePage(a, player));
  const best = pages[0];
  if (!best || scorePage(best, player) < 25) return null;
  return {
    title: best.title,
    pageUrl: best.fullurl,
    imageUrl: best.thumbnail?.source ?? best.original?.source,
  };
}

async function fetchJSON(url) {
  const response = await fetchWithRetry(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" } });
  if (!response.ok) throw new Error(`Wikipedia HTTP ${response.status}`);
  return response.json();
}

function scorePage(page, player) {
  const title = normalize(page.title);
  const name = normalize(player.name);
  const tokens = name.split(/\s+/).filter((token) => token.length > 2);
  let score = 0;
  if (title === name) score += 100;
  if (title.includes(name)) score += 80;
  for (const token of tokens) {
    if (title.includes(token)) score += 8;
  }
  if (title.includes("football")) score += 15;
  if (page.original?.source || page.thumbnail?.source) score += 20;
  return score;
}

function normalize(value) {
  return String(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, "")
    .toLowerCase()
    .trim();
}

async function downloadImage(id, imageUrl) {
  const response = await fetchWithRetry(imageUrl, { headers: { "user-agent": USER_AGENT, accept: "image/*" } });
  if (!response.ok) throw new Error(`image HTTP ${response.status}`);
  const type = response.headers.get("content-type") ?? "";
  const ext = extensionFor(type);
  if (!ext) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1500) return null;
  const file = `${id}${ext}`;
  fs.writeFileSync(path.join(PUBLIC_DIR, file), bytes);
  return `/player-photos/${file}`;
}

async function fetchWithRetry(url, options) {
  let lastResponse;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response;
    try {
      response = await fetchWithTimeout(url, options);
    } catch (error) {
      lastError = error;
      await sleep(1800 * (attempt + 1));
      continue;
    }
    if (response.status !== 429 && response.status < 500) return response;
    lastResponse = response;
    const retryAfter = Number(response.headers.get("retry-after"));
    const retryWait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2500 * (attempt + 1);
    const wait = Math.min(retryWait, 10000);
    await sleep(wait);
  }
  if (lastResponse) return lastResponse;
  throw lastError ?? new Error("request failed");
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extensionFor(contentType) {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  return null;
}

function writePhotoMap(photos) {
  const sorted = Object.entries(photos).sort(([a], [b]) => a.localeCompare(b));
  fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify(Object.fromEntries(sorted), null, 2)}\n`);
  if (!writeTs) return;
  const body = sorted.map(([id, photo]) => `  ${JSON.stringify(id)}: ${JSON.stringify(photo)},`).join("\n");
  fs.writeFileSync(PHOTO_MAP_FILE, `export const PLAYER_PHOTOS: Record<string, string> = {\n${body}\n};\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
