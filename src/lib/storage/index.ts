// One storage interface. Callers keep only the returned KEY, never a URL, so moving
// buckets later is a copy plus a setting. Files are private; they are read back
// through the app (which checks who is asking), never through a public link.
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

export interface FileStore {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

const safe = (key: string) => {
  if (!/^[\w./-]+$/.test(key) || key.includes("..")) throw new Error("Bad storage key");
  return key;
};

/** Local disk: for development and a self-hosted server. */
export class DiskStore implements FileStore {
  constructor(private root: string) {}
  private file(key: string) { return path.join(this.root, safe(key)); }
  async put(key: string, data: Buffer, _contentType?: string) { const f = this.file(key); await mkdir(path.dirname(f), { recursive: true }); await writeFile(f, data); }
  async get(key: string) { const f = this.file(key); try { return await readFile(f); } catch { return null; } }
  async delete(key: string) { const f = this.file(key); try { await unlink(f); } catch { /* already gone */ } }
}

/** Vercel Blob in private mode. Needs BLOB_READ_WRITE_TOKEN (created by adding a Blob store to the project). */
export class BlobStore implements FileStore {
  async put(key: string, data: Buffer, contentType: string) {
    const { put } = await import("@vercel/blob");
    await put(safe(key), data, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType });
  }
  async get(key: string) {
    const { get } = await import("@vercel/blob");
    const res = await get(safe(key), { access: "private" });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    return Buffer.from(await new Response(res.stream).arrayBuffer());
  }
  async delete(key: string) {
    const { del } = await import("@vercel/blob");
    await del(safe(key));
  }
}

let cached: FileStore | undefined;
export function getStore(): FileStore {
  if (cached) return cached;
  if (process.env.BLOB_READ_WRITE_TOKEN) return (cached = new BlobStore());
  if (process.env.VERCEL) throw new Error("File storage is not set up: add a Vercel Blob store to the project (BLOB_READ_WRITE_TOKEN).");
  return (cached = new DiskStore(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads")));
}
