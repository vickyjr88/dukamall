import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Client } from 'minio';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The image type a buffer actually is, from its magic bytes -- or null if it isn't a supported image. */
export function detectImageType(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.subarray(0, 4).toString('ascii') === 'GIF8') return { mime: 'image/gif', ext: 'gif' };
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp' && /^avi[fs]$/.test(buf.subarray(8, 12).toString('ascii'))) return { mime: 'image/avif', ext: 'avif' };
  return null;
}

type UploadedFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

/**
 * One shared MinIO bucket for every shop, keyed under `{shopId}/{uuid}` --
 * design doc S:2.6. drip-crm's version used a flat key with no tenant
 * boundary, which `listImages` there would have leaked across shops if
 * ported as-is; every method here takes a mandatory shopId and never lists
 * or reads outside that shop's own prefix.
 */
@Injectable()
export class MediaService {
  private readonly bucketName: string;
  private readonly publicBaseUrl: string;
  private readonly client: Client;
  private bucketReady = false;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL || '';
    const useDockerNetwork = databaseUrl.includes('@db:');
    const endPoint = process.env.MINIO_ENDPOINT || (useDockerNetwork ? 'minio' : 'localhost');
    const port = Number(process.env.MINIO_PORT || (useDockerNetwork ? 9000 : 19000));

    this.bucketName = process.env.MINIO_BUCKET || 'shops-platform-media';
    this.publicBaseUrl = process.env.MEDIA_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3200';

    this.client = new Client({
      endPoint,
      port,
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ROOT_USER || 'minioadmin',
      secretKey: process.env.MINIO_ROOT_PASSWORD || 'minioadmin123',
    });
  }

  async upload(shopId: string, file: UploadedFile) {
    // Decided from the file's own bytes, never from the client-declared
    // mimetype or filename: objects are served back publicly from the API
    // origin under their stored content-type, so a "photo.png" that is
    // really HTML would otherwise be served as a page (stored XSS). SVG is
    // deliberately not accepted for the same reason -- it can carry script.
    const kind = detectImageType(file.buffer);
    if (!kind) {
      throw new BadRequestException('Only PNG, JPEG, WebP, GIF or AVIF images can be uploaded.');
    }

    await this.ensureBucket();
    const objectKey = `${shopId}/${randomUUID()}.${kind.ext}`;

    await this.client.putObject(this.bucketName, objectKey, file.buffer, file.buffer.length, {
      'Content-Type': kind.mime,
    });

    return {
      objectKey,
      url: this.urlFor(objectKey),
      contentType: kind.mime,
      fileName: file.originalname,
      sizeBytes: file.buffer.length,
    };
  }

  async listImages(shopId: string, limit = 60) {
    await this.ensureBucket();

    const objects: Array<{ name: string; size: number; lastModified: Date }> = [];
    await new Promise<void>((resolve, reject) => {
      // Prefix-scoped listing -- this is the actual isolation boundary. A shop
      // physically cannot enumerate another shop's objects through this call.
      const stream = this.client.listObjectsV2(this.bucketName, `${shopId}/`, true);
      stream.on('data', (item: any) => {
        if (item.name) objects.push({ name: item.name, size: item.size, lastModified: item.lastModified });
      });
      stream.on('error', reject);
      stream.on('end', resolve);
    });

    return objects
      .filter((object) => /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(object.name))
      .sort((a, b) => Number(b.lastModified) - Number(a.lastModified))
      .slice(0, limit)
      .map((image) => ({ objectKey: image.name, url: this.urlFor(image.name), sizeBytes: image.size }));
  }

  async getObject(shopId: string, objectKey: string) {
    // objectKey must already be prefixed with the requesting shop's id, or
    // this throws -- refuses a shop's staff from guessing another shop's
    // object key and streaming it back.
    if (!objectKey.startsWith(`${shopId}/`)) {
      throw new NotFoundException('Media asset not found');
    }
    await this.ensureBucket();
    try {
      const [stat, stream] = await Promise.all([
        this.client.statObject(this.bucketName, objectKey),
        this.client.getObject(this.bucketName, objectKey),
      ]);
      return { stream, contentType: stat.metaData['content-type'] || 'application/octet-stream', fileName: objectKey };
    } catch {
      throw new NotFoundException('Media asset not found');
    }
  }

  private urlFor(objectKey: string) {
    return `${this.publicBaseUrl.replace(/\/$/, '')}/media/${objectKey}`;
  }

  private async ensureBucket() {
    if (this.bucketReady) return;
    const exists = await this.client.bucketExists(this.bucketName);
    if (!exists) await this.client.makeBucket(this.bucketName, 'us-east-1');
    this.bucketReady = true;
  }
}
