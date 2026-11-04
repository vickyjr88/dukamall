import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Client } from 'minio';
import sharp from 'sharp';
import type { OutputInfo, Sharp } from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { readImageDimensions } from './image-dimensions.util';

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

export type CropRect = { x: number; y: number; width: number; height: number };

/** What the library and the media manager show for one image. */
export type MediaAssetView = {
  id: string;
  objectKey: string;
  url: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  uploadedAt: Date;
  /** When the picture last changed. The address stays the same after a crop, so this is what tells a cache to refetch. */
  updatedAt: Date;
  /** True once the image has been cropped: an earlier version exists and can be restored. */
  hasPreviousVersion: boolean;
};

type StoredVersion = {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  replacedAt: string;
  replacedBy: string | null;
};

/** Where a shop's earlier versions are kept, under its own prefix. Never listed as library images. */
const versionsPrefix = (shopId: string) => `${shopId}/versions/`;
/** How many earlier versions of one image are kept; older ones are deleted. */
const MAX_VERSIONS = 5;

const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|avif)$/i;
const MIN_CROP_PX = 16;
/** Refuse to decode anything beyond this many pixels, whatever the file size: a small file can expand enormously. */
const MAX_INPUT_PIXELS = 80_000_000;
const SYNC_EVERY_MS = 30_000;
const ENRICH_PER_CALL = 24;

const contentTypeForName = (name: string) => {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  return (
    ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' } as Record<string, string>)[ext ?? ''] ??
    'application/octet-stream'
  );
};

/** The format a crop is written in: the source's own where sharp can write it, PNG for those it cannot (GIF). */
function outputFormat(contentType: string): { mime: string; encode: (img: Sharp) => Sharp } {
  switch (contentType) {
    case 'image/jpeg':
      return { mime: 'image/jpeg', encode: (i) => i.jpeg({ quality: 92, mozjpeg: true }) };
    case 'image/webp':
      return { mime: 'image/webp', encode: (i) => i.webp({ quality: 92 }) };
    case 'image/avif':
      return { mime: 'image/avif', encode: (i) => i.avif({ quality: 70 }) };
    default:
      return { mime: 'image/png', encode: (i) => i.png() };
  }
}

const extensionOf = (name: string) => {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index) : '';
};

/**
 * One shared MinIO bucket for every shop, keyed under `{shopId}/{uuid}` -- design doc S:2.6. Every method here takes a
 * mandatory shopId and never lists, reads or changes anything outside that shop's own prefix and rows: an image id from
 * another shop is "not found", exactly like one that does not exist.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly lastSync = new Map<string, number>();
  private readonly syncing = new Map<string, Promise<void>>();
  private readonly bucketName: string;
  private readonly publicBaseUrl: string;
  private readonly client: Client;
  private bucketReady = false;

  constructor(private readonly prisma: PrismaService) {
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

  async upload(shopId: string, file: UploadedFile, uploadedBy?: string) {
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

    const dimensions = readImageDimensions(file.buffer);
    const fileName = (file.originalname || objectKey.split('/').pop() || objectKey).slice(0, 200);

    // A failure to record must not fail the upload: the object is stored and the sync picks it up later.
    const asset = await this.prisma.mediaAsset
      .create({
        data: {
          shopId,
          objectKey,
          fileName,
          contentType: kind.mime,
          sizeBytes: file.buffer.length,
          width: dimensions?.width ?? null,
          height: dimensions?.height ?? null,
          uploadedBy: uploadedBy ?? null,
        },
      })
      .catch((error) => {
        this.logger.warn(`Could not record upload ${objectKey}: ${error instanceof Error ? error.message : error}`);
        return null;
      });

    return {
      id: asset?.id ?? null,
      objectKey,
      url: this.urlFor(objectKey),
      contentType: kind.mime,
      fileName,
      sizeBytes: file.buffer.length,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
    };
  }

  /**
   * This shop's images, newest first, for the media manager and the product / theme pickers.
   *
   * The list comes from the MediaAsset table. Files uploaded before that table existed are added to it from the shop's
   * own bucket prefix (see syncFromBucket), so nothing already in use goes missing from the library.
   */
  async listLibrary(shopId: string, params: { limit?: number; cursor?: string; search?: string } = {}) {
    await this.syncFromBucket(shopId);

    const limit = Math.min(Math.max(params.limit ?? 60, 1), 200);
    const where: Prisma.MediaAssetWhereInput = {
      shopId,
      contentType: { startsWith: 'image/' },
      ...(params.search?.trim() ? { fileName: { contains: params.search.trim(), mode: 'insensitive' } } : {}),
    };

    const rows = await this.prisma.mediaAsset.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
    const total = await this.prisma.mediaAsset.count({ where });

    const page = rows.slice(0, limit);
    void this.fillMissingDimensions(page.filter((row) => row.width === null || row.height === null));

    return { items: page.map((row) => this.view(row)), nextCursor: rows.length > limit ? page[page.length - 1].id : null, total };
  }

  private versionsOf(row: { versions?: unknown }): StoredVersion[] {
    return Array.isArray(row.versions) ? (row.versions as StoredVersion[]) : [];
  }

  private view(row: any): MediaAssetView {
    return {
      id: row.id,
      objectKey: row.objectKey,
      url: this.urlFor(row.objectKey),
      fileName: row.fileName,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      width: row.width,
      height: row.height,
      uploadedAt: row.createdAt,
      updatedAt: row.updatedAt ?? row.createdAt,
      hasPreviousVersion: this.versionsOf(row).length > 0,
    };
  }

  /**
   * Adds images that are in this shop's bucket prefix but not in the table: everything uploaded before the library had
   * a table. Their name is the file's key (the original name was never kept) and their date the object's own. Cheap when
   * nothing is new, and throttled per shop, so opening the picker repeatedly does not keep listing the bucket.
   */
  private async syncFromBucket(shopId: string) {
    if (Date.now() - (this.lastSync.get(shopId) ?? 0) < SYNC_EVERY_MS) return;
    const running = this.syncing.get(shopId);
    if (running) return running;

    const job = (async () => {
      try {
        await this.ensureBucket();
        const objects: Array<{ name: string; size: number; lastModified: Date }> = [];
        const skip = versionsPrefix(shopId);
        await new Promise<void>((resolve, reject) => {
          // Prefix-scoped listing -- this is the isolation boundary: a shop cannot import another shop's files.
          const stream = this.client.listObjectsV2(this.bucketName, `${shopId}/`, true);
          stream.on('data', (item: any) => {
            if (item.name && !item.name.startsWith(skip) && IMAGE_EXTENSIONS.test(item.name)) {
              objects.push({ name: item.name, size: item.size, lastModified: item.lastModified });
            }
          });
          stream.on('error', reject);
          stream.on('end', resolve);
        });

        const known = new Set((await this.prisma.mediaAsset.findMany({ where: { shopId }, select: { objectKey: true } })).map((r) => r.objectKey));
        const missing = objects.filter((object) => !known.has(object.name));
        if (missing.length) {
          await this.prisma.mediaAsset.createMany({
            data: missing.map((object) => ({
              shopId,
              objectKey: object.name,
              fileName: object.name.slice(shopId.length + 1),
              contentType: contentTypeForName(object.name),
              sizeBytes: object.size,
              createdAt: object.lastModified,
            })),
            skipDuplicates: true,
          });
          this.logger.log(`Media library: added ${missing.length} existing image(s) for shop ${shopId}`);
        }
        this.lastSync.set(shopId, Date.now());
      } catch (error) {
        // The table still serves what it has; try again on a later call.
        this.logger.warn(`Media library sync failed: ${error instanceof Error ? error.message : error}`);
      } finally {
        this.syncing.delete(shopId);
      }
    })();
    this.syncing.set(shopId, job);
    return job;
  }

  /** Reads dimensions for images listed without them (the backfilled ones), so the next listing has them. Best effort. */
  private async fillMissingDimensions(rows: Array<{ id: string; objectKey: string }>) {
    for (const row of rows.slice(0, ENRICH_PER_CALL)) {
      try {
        const dimensions = readImageDimensions(await this.readHead(row.objectKey, 65_536));
        if (dimensions) await this.prisma.mediaAsset.update({ where: { id: row.id }, data: dimensions });
      } catch {
        // Not readable (damaged): the library simply shows no dimensions for it.
      }
    }
  }

  private async readWhole(objectKey: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucketName, objectKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  private async readHead(objectKey: string, byteCount: number): Promise<Buffer> {
    const stream = await this.client.getPartialObject(this.bucketName, objectKey, 0, byteCount);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  /** The shop's own image row, or "not found": another shop's id is indistinguishable from one that does not exist. */
  private async ownAsset(shopId: string, assetId: string) {
    const row = await this.prisma.mediaAsset.findFirst({ where: { id: assetId, shopId } });
    if (!row || !row.contentType.startsWith('image/')) throw new NotFoundException('Image not found');
    return row;
  }

  /**
   * Crops an image IN PLACE: the file under the same address is overwritten with the cropped picture, so the library
   * keeps one image and everything already using it (a product, the logo, the hero) shows the cropped version. Nothing
   * breaks and nothing needs re-linking. The picture as it was is kept as a previous version (see restoreAsset), not
   * as a library image.
   *
   * `selection` is in the pixels of the picture as displayed (after any camera-orientation rotation), which is what a
   * browser reports as its natural size. `{ square: true }` instead takes the largest centred square.
   */
  async cropAsset(shopId: string, assetId: string, selection: CropRect | { square: true }, changedBy?: string): Promise<MediaAssetView> {
    const row = await this.ownAsset(shopId, assetId);

    await this.ensureBucket();
    let original: Buffer;
    try {
      original = await this.readWhole(row.objectKey);
    } catch {
      throw new NotFoundException('The image file is missing from storage');
    }

    let oriented: { data: Buffer; info: OutputInfo };
    try {
      oriented = await sharp(original, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().toBuffer({ resolveWithObject: true });
    } catch {
      throw new BadRequestException('This image cannot be cropped (it could not be read).');
    }
    const { width: fullWidth, height: fullHeight } = oriented.info;

    let left: number;
    let top: number;
    let width: number;
    let height: number;
    if ('square' in selection) {
      width = height = Math.min(fullWidth, fullHeight);
      left = Math.floor((fullWidth - width) / 2);
      top = Math.floor((fullHeight - height) / 2);
    } else {
      left = Math.round(selection.x);
      top = Math.round(selection.y);
      width = Math.round(selection.width);
      height = Math.round(selection.height);
    }
    if (![left, top, width, height].every(Number.isFinite) || left < 0 || top < 0 || width < MIN_CROP_PX || height < MIN_CROP_PX) {
      throw new BadRequestException(`The crop must be at least ${MIN_CROP_PX} x ${MIN_CROP_PX} pixels and inside the image.`);
    }
    // A pixel of tolerance either way: the crop box is drawn on a scaled copy and rounds.
    if (left >= fullWidth || top >= fullHeight || left + width > fullWidth + 1 || top + height > fullHeight + 1) {
      throw new BadRequestException('The crop falls outside the image.');
    }
    const right = Math.min(left + width, fullWidth);
    const bottom = Math.min(top + height, fullHeight);
    if (left === 0 && top === 0 && right === fullWidth && bottom === fullHeight) {
      throw new BadRequestException('That crop is the whole image: there is nothing to crop.');
    }

    const format = outputFormat(row.contentType);
    const cropped = await format
      .encode(sharp(oriented.data).extract({ left, top, width: right - left, height: bottom - top }))
      .toBuffer({ resolveWithObject: true });

    // Keep the picture as it was, then overwrite. The copy goes first: if anything after it fails, nothing is lost.
    const backupKey = `${versionsPrefix(shopId)}${randomUUID()}${extensionOf(row.objectKey)}`;
    await this.client.putObject(this.bucketName, backupKey, original, original.length, { 'Content-Type': row.contentType });
    await this.client.putObject(this.bucketName, row.objectKey, cropped.data, cropped.data.length, { 'Content-Type': format.mime });

    const kept: StoredVersion[] = [
      ...this.versionsOf(row),
      {
        objectKey: backupKey,
        contentType: row.contentType,
        sizeBytes: original.length,
        width: row.width ?? fullWidth,
        height: row.height ?? fullHeight,
        replacedAt: new Date().toISOString(),
        replacedBy: changedBy ?? null,
      },
    ];
    const dropped = kept.splice(0, Math.max(0, kept.length - MAX_VERSIONS));

    let updated;
    try {
      updated = await this.prisma.mediaAsset.update({
        where: { id: row.id },
        data: {
          contentType: format.mime,
          sizeBytes: cropped.data.length,
          width: cropped.info.width,
          height: cropped.info.height,
          versions: kept as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      // The file is already overwritten but the record could not say so: put the picture back rather than leave them out of step.
      await this.client.putObject(this.bucketName, row.objectKey, original, original.length, { 'Content-Type': row.contentType }).catch(() => undefined);
      throw error;
    }
    await this.removeObjects(dropped.map((version) => version.objectKey));
    return this.view(updated);
  }

  /** Undoes the most recent crop: puts the previous version back under the same address. */
  async restoreAsset(shopId: string, assetId: string): Promise<MediaAssetView> {
    const row = await this.ownAsset(shopId, assetId);
    const versions = this.versionsOf(row);
    const previous = versions[versions.length - 1];
    if (!previous) throw new BadRequestException('This image has not been cropped, so there is no earlier version to restore.');

    await this.ensureBucket();
    let bytes: Buffer;
    try {
      bytes = await this.readWhole(previous.objectKey);
    } catch {
      throw new NotFoundException('The earlier version is missing from storage');
    }
    await this.client.putObject(this.bucketName, row.objectKey, bytes, bytes.length, { 'Content-Type': previous.contentType });
    const updated = await this.prisma.mediaAsset.update({
      where: { id: row.id },
      data: {
        contentType: previous.contentType,
        sizeBytes: previous.sizeBytes,
        width: previous.width,
        height: previous.height,
        versions: versions.slice(0, -1) as unknown as Prisma.InputJsonValue,
      },
    });
    await this.removeObjects([previous.objectKey]);
    return this.view(updated);
  }

  private async removeObjects(keys: string[]) {
    for (const key of keys) {
      await this.client.removeObject(this.bucketName, key).catch((error: unknown) => {
        this.logger.warn(`Could not delete ${key}: ${error instanceof Error ? error.message : error}`);
      });
    }
  }

  /**
   * The stored file, for the public image route. `ifNoneMatch` is the validator the browser (or a CDN) already holds:
   * when it still matches, the file is not read at all and the caller answers "not modified".
   */
  async getObject(shopId: string, objectKey: string, ifNoneMatch?: string) {
    // objectKey must already be prefixed with the requesting shop's id, or
    // this throws -- refuses a shop's staff from guessing another shop's
    // object key and streaming it back. Earlier versions sit one level
    // deeper ("{shopId}/versions/...") and are not reachable through the
    // public single-segment route.
    if (!objectKey.startsWith(`${shopId}/`)) {
      throw new NotFoundException('Media asset not found');
    }
    await this.ensureBucket();

    let stat: any;
    try {
      stat = await this.client.statObject(this.bucketName, objectKey);
    } catch {
      throw new NotFoundException('Media asset not found');
    }
    const etag: string | undefined = stat.etag ? String(stat.etag).replace(/"/g, '') : undefined;
    const lastModified: Date | undefined = stat.lastModified;
    const contentType = stat.metaData?.['content-type'] || 'application/octet-stream';

    if (etag && ifNoneMatch && ifNoneMatch.split(',').some((candidate) => candidate.trim().replace(/^W\//, '').replace(/"/g, '') === etag)) {
      return { notModified: true as const, etag, lastModified, contentType, fileName: objectKey };
    }

    try {
      const stream = await this.client.getObject(this.bucketName, objectKey);
      return { notModified: false as const, stream, etag, lastModified, contentType, fileName: objectKey };
    } catch {
      throw new NotFoundException('Media asset not found');
    }
  }

  /** Can the object store be reached, and does our bucket exist? For the admin health panel. */
  async ping(): Promise<{ ok: boolean; ms: number; error?: string }> {
    const started = Date.now();
    try {
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out after 5s')), 5000));
      const exists = await Promise.race([this.client.bucketExists(this.bucketName), timeout]);
      return exists ? { ok: true, ms: Date.now() - started } : { ok: false, ms: Date.now() - started, error: `bucket "${this.bucketName}" does not exist` };
    } catch (err) {
      return { ok: false, ms: Date.now() - started, error: (err as Error).message };
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
