/**
 * Local disk file storage — replaces Replit ObjectStorageService for local dev.
 *
 * Files are saved to <project-root>/uploads/ and served by Express static
 * middleware mounted at /uploads (see server/index.ts).
 *
 * URL format: /uploads/<uuid>.<ext>
 *
 * When PRIVATE_OBJECT_DIR is set (Replit production), the ObjectStorageService
 * is used instead — this module is only invoked when that env var is absent.
 */

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

export const UPLOADS_DIR = path.join(process.cwd(), "uploads");

const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
};

/** Create the uploads directory if it does not already exist. */
export function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

/**
 * Save a file buffer to local disk and return the URL path.
 * Returned URL is always rooted at /uploads/ so Express static serves it.
 */
export function saveFile(buffer: Buffer, mimetype: string): string {
  ensureUploadsDir();
  const ext = MIME_TO_EXT[mimetype] ?? ".bin";
  const filename = randomUUID() + ext;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return `/uploads/${filename}`;
}

/**
 * Maps a /uploads/<filename> URL back to an absolute filesystem path.
 * Returns null if the URL is not a local uploads path or the file doesn't exist.
 */
export function getLocalFilePath(fileUrl: string): string | null {
  if (!fileUrl || !fileUrl.startsWith("/uploads/")) return null;
  const filename = fileUrl.slice("/uploads/".length);
  // Prevent path traversal
  if (filename.includes("..") || filename.includes("/")) return null;
  const fullPath = path.join(UPLOADS_DIR, filename);
  return fs.existsSync(fullPath) ? fullPath : null;
}
