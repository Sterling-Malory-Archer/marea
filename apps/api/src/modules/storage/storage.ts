import fs from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Env } from "../../config/env.js";

/** Object storage for product photography and media. Only keys live in MySQL. */
export interface Storage {
  readonly driver: "local" | "s3";
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}

const assertSafeKey = (key: string) => {
  if (!/^[a-z0-9][a-z0-9/_.-]{0,500}$/i.test(key) || key.includes("..")) throw new Error(`Unsafe storage key: ${key}`);
};

class S3Storage implements Storage {
  readonly driver = "s3" as const;
  private client: S3Client;
  constructor(private env: Env) {
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT || undefined,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    });
  }
  async put(key: string, body: Buffer, contentType: string) {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Keys are content-unique (UUID), so they can be cached forever.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }
  async delete(key: string) {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }));
  }
  publicUrl(key: string) {
    return `${this.env.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
  }
}

/** Development-only driver: writes under LOCAL_STORAGE_DIR, served at /media by the API. */
class LocalStorage implements Storage {
  readonly driver = "local" as const;
  readonly root: string;
  constructor(private env: Env) {
    this.root = path.resolve(env.LOCAL_STORAGE_DIR);
  }
  async put(key: string, body: Buffer) {
    assertSafeKey(key);
    const file = path.join(this.root, key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
  }
  async delete(key: string) {
    assertSafeKey(key);
    await fs.rm(path.join(this.root, key), { force: true });
  }
  publicUrl(key: string) {
    return `${this.env.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
  }
}

export function createStorage(env: Env): Storage {
  return env.STORAGE_DRIVER === "s3" ? new S3Storage(env) : new LocalStorage(env);
}
