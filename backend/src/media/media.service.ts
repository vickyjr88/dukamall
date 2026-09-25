import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Client } from 'minio';

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
    await this.ensureBucket();
    const objectKey = `${shopId}/${randomUUID()}${this.getFileExtension(file.originalname)}`;

    await this.client.putObject(this.bucketName, objectKey, file.buffer, file.buffer.length, {
      'Content-Type': file.mimetype,
    });

    return {
      objectKey,
      url: this.urlFor(objectKey),
      contentType: file.mimetype,
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

  private getFileExtension(fileName: string) {
    const index = fileName.lastIndexOf('.');
    return index >= 0 ? fileName.slice(index) : '';
  }
}
