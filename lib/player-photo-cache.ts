import "server-only";
import fs from "node:fs";
import path from "node:path";
import { PLAYER_PHOTOS } from "./generated/player-photos";

const PHOTO_DIR = path.join(process.cwd(), "public/player-photos");
const MANIFEST = path.join(PHOTO_DIR, "manifest.json");

let cached: { mtime: number; photos: Record<string, string> } | null = null;

export function cachedPlayerPhotos(): Record<string, string> {
  try {
    const stat = fs.statSync(MANIFEST);
    if (cached && cached.mtime === stat.mtimeMs) return cached.photos;
    const photos = {
      ...PLAYER_PHOTOS,
      ...(JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as Record<string, string>),
      ...photosFromFiles(),
    };
    cached = { mtime: stat.mtimeMs, photos };
    return photos;
  } catch {
    return { ...PLAYER_PHOTOS, ...photosFromFiles() };
  }
}

export function cachedPlayerPhoto(playerId: string): string | undefined {
  return cachedPlayerPhotos()[playerId] ?? PLAYER_PHOTOS[playerId];
}

export function playerPhotoCacheStats(totalPlayers: number) {
  const photos = cachedPlayerPhotos();
  const files = fs.existsSync(PHOTO_DIR)
    ? fs.readdirSync(PHOTO_DIR).filter((file) => /\.(jpg|png|webp)$/i.test(file)).length
    : 0;
  return {
    totalPlayers,
    cachedPlayers: Object.keys(photos).length,
    files,
    coverage: totalPlayers ? Object.keys(photos).length / totalPlayers : 0,
  };
}

export function playerPhotoJobStatus() {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), ".data");
  const dir = path.join(dataDir, "jobs");
  const pidFile = path.join(dir, "player-photo-fetch.pid");
  const logFile = path.join(dir, "player-photo-fetch.log");
  const pid = readPid(pidFile);
  const running = pid ? isRunning(pid) : false;
  const log = readTail(logFile, 18);
  return { running, pid, log };
}

function readPid(file: string): number | null {
  try {
    const pid = Number(fs.readFileSync(file, "utf8").trim());
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function photosFromFiles(): Record<string, string> {
  try {
    return Object.fromEntries(
      fs
        .readdirSync(PHOTO_DIR)
        .map((file) => file.match(/^(.+)\.(jpg|png|webp)$/i))
        .filter(Boolean)
        .map((match) => [match![1], `/player-photos/${match![0]}`]),
    );
  } catch {
    return {};
  }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readTail(file: string, lines: number): string[] {
  try {
    return fs.readFileSync(file, "utf8").trim().split(/\r?\n/).slice(-lines);
  } catch {
    return [];
  }
}
