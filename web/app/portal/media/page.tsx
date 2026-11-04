"use client";

/**
 * Media library: every image in this shop in one place. Upload new ones, find existing ones by name, and crop.
 *
 * Cropping replaces the image itself: it keeps its address, so every product, the logo and the hero already using it
 * show the cropped picture and nothing breaks. The previous version is kept and can be restored here. The same library
 * feeds the picker wherever a photo is chosen (product photos, logo, hero).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { authHeaders, PORTAL_API_BASE } from '../portal-api';
import { CropDialog } from './crop-dialog';
import { MediaItem, MediaLibraryPage, formatBytes, freshUrl, mediaRequest } from './media-types';

export default function MediaPage() {
  const [images, setImages] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [listing, setListing] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cropping, setCropping] = useState<MediaItem | null>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadPage = useCallback(async (after?: string) => {
    setListing(true);
    try {
      const params = new URLSearchParams({ limit: '60' });
      if (after) params.set('cursor', after);
      if (search) params.set('search', search);
      const data = await mediaRequest<MediaLibraryPage>(`/media/library?${params}`);
      setImages((prev) => (after ? [...prev, ...data.items] : data.items));
      setCursor(data.nextCursor);
      setTotal(data.total);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setListing(false);
    }
  }, [search]);

  useEffect(() => { void loadPage(); }, [loadPage]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  async function upload(files: File[]) {
    const pictures = files.filter((file) => file.type.startsWith('image/'));
    if (pictures.length === 0) {
      if (files.length) setError('Only image files can be added to the media library.');
      return;
    }
    setError(null);
    setNotice(null);
    setUploading({ done: 0, total: pictures.length });
    const added: MediaItem[] = [];
    try {
      for (const file of pictures) {
        const body = new FormData();
        body.append('file', file);
        const res = await fetch(`${PORTAL_API_BASE}/media/upload`, { method: 'POST', headers: authHeaders(), body });
        const data = await res.json();
        if (!res.ok) throw new Error(Array.isArray(data?.message) ? data.message[0] : data?.message || `Could not upload ${file.name}`);
        const now = new Date().toISOString();
        added.push({
          id: data.id ?? data.objectKey, objectKey: data.objectKey, url: data.url, fileName: data.fileName, contentType: data.contentType,
          sizeBytes: data.sizeBytes ?? file.size, width: data.width, height: data.height, uploadedAt: now, updatedAt: now, hasPreviousVersion: false,
        });
        setUploading({ done: added.length, total: pictures.length });
      }
      setNotice(`${added.length} image${added.length === 1 ? '' : 's'} uploaded.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      if (added.length) {
        setImages((prev) => [...added, ...prev]);
        setTotal((prev) => prev + added.length);
        setSelectedId(added[0].id);
      }
      setUploading(null);
    }
  }

  const selected = images.find((image) => image.id === selectedId) ?? null;

  /** The image after a crop or restore: same place in the library, same address, new picture. */
  const replaceItem = (updated: MediaItem) => setImages((prev) => prev.map((image) => (image.id === updated.id ? updated : image)));

  function onCropped(updated: MediaItem) {
    setCropping(null);
    replaceItem(updated);
    setNotice('Image cropped. Everywhere it is used now shows the cropped picture.');
  }

  async function makeSquare(item: MediaItem) {
    if (!window.confirm('Make this image square? It is cropped to a centred square and replaces the image everywhere it is used. You can restore the previous version afterwards.')) return;
    setError(null);
    try {
      onCropped(await mediaRequest<MediaItem>('/media/crop', { method: 'POST', body: { assetId: item.id, square: true } }));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function restore(item: MediaItem) {
    if (!window.confirm('Restore the previous version? The last crop is undone and the picture goes back to how it was, everywhere it is used.')) return;
    setError(null);
    try {
      replaceItem(await mediaRequest<MediaItem>('/media/restore', { method: 'POST', body: { assetId: item.id } }));
      setNotice('Previous version restored.');
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function copyLink(item: MediaItem) {
    try {
      await navigator.clipboard.writeText(item.url);
      setNotice('Image link copied.');
    } catch {
      setError('Could not copy the link. Select it and copy it by hand.');
    }
  }

  return (
    <div>
      <div className="portal-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3>Media</h3>
          <p style={{ color: 'var(--p-muted)', margin: '4px 0 0', fontSize: '0.88rem' }}>
            {total} image{total === 1 ? '' : 's'}. Upload, find and crop here, then reuse them from any photo field.
          </p>
        </div>
        <div>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            multiple
            hidden
            onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void upload(files); }}
          />
          <button type="button" className="portal-btn" disabled={uploading !== null} onClick={() => fileInput.current?.click()}>
            {uploading ? `Uploading ${uploading.done} of ${uploading.total}…` : 'Upload images'}
          </button>
        </div>
      </div>

      {error ? <div className="portal-alert is-error">{error}</div> : null}
      {notice ? <div className="portal-alert is-success">{notice}</div> : null}

      <div
        className={`portal-card pm-drop${dragging ? ' is-dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void upload(Array.from(e.dataTransfer.files)); }}
      >
        <input
          type="search"
          placeholder="Search by file name…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          aria-label="Search images by file name"
          style={{ maxWidth: 360 }}
        />
        <p style={{ color: 'var(--p-muted)', fontSize: '0.8rem', margin: '6px 0 14px' }}>Drop pictures anywhere in this box to upload them.</p>

        <div className="pm-layout">
          <div>
            {!listing && images.length === 0 ? (
              <div className="portal-empty">{search ? 'No image matches that name.' : 'No images yet. Upload one to start the library.'}</div>
            ) : (
              <div className="pm-grid">
                {images.map((image) => (
                  <button
                    key={image.id}
                    type="button"
                    className={`pm-card${image.id === selectedId ? ' is-selected' : ''}`}
                    onClick={() => setSelectedId(image.id)}
                    aria-pressed={image.id === selectedId}
                    title={image.fileName}
                  >
                    <img src={freshUrl(image)} alt={image.fileName} loading="lazy" />
                    {image.hasPreviousVersion ? <span className="pm-badge">Cropped</span> : null}
                    <span className="pm-caption">{image.fileName}</span>
                  </button>
                ))}
              </div>
            )}
            {listing ? <p style={{ color: 'var(--p-muted)' }}>Loading images…</p> : null}
            {cursor && !listing ? (
              <button type="button" className="portal-btn portal-btn-outline" style={{ marginTop: 12 }} onClick={() => void loadPage(cursor)}>
                Load more
              </button>
            ) : null}
          </div>

          <aside className="pm-detail" aria-label="Image details">
            {selected ? (
              <>
                <img className="pm-preview" src={freshUrl(selected)} alt={selected.fileName} />
                <h4 style={{ margin: '12px 0 4px', wordBreak: 'break-word', textTransform: 'none', letterSpacing: 0, color: 'var(--p-ink)', fontSize: '0.95rem' }}>{selected.fileName}</h4>
                <p style={{ color: 'var(--p-muted)', margin: 0, fontSize: '0.82rem' }}>
                  {selected.width && selected.height ? `${selected.width} × ${selected.height} px · ` : ''}
                  {formatBytes(selected.sizeBytes)} · {new Date(selected.uploadedAt).toLocaleDateString()}
                </p>
                {selected.hasPreviousVersion ? <p style={{ color: 'var(--p-muted)', margin: '8px 0 0', fontSize: '0.82rem' }}>This image has been cropped.</p> : null}
                <div className="pm-buttons">
                  <button type="button" className="portal-btn portal-btn-sm" onClick={() => setCropping(selected)}>Crop</button>
                  <button type="button" className="portal-btn portal-btn-sm" onClick={() => void makeSquare(selected)}>Make square</button>
                </div>
                <div className="pm-buttons">
                  {selected.hasPreviousVersion ? (
                    <button type="button" className="portal-btn portal-btn-outline portal-btn-sm" onClick={() => void restore(selected)}>Restore previous version</button>
                  ) : null}
                  <button type="button" className="portal-btn portal-btn-outline portal-btn-sm" onClick={() => void copyLink(selected)}>Copy link</button>
                  <a className="portal-btn portal-btn-outline portal-btn-sm" href={selected.url} target="_blank" rel="noreferrer">Open</a>
                </div>
                <p style={{ color: 'var(--p-muted)', marginTop: 12, fontSize: '0.78rem' }}>
                  Cropping replaces this image everywhere it is used, and keeps the earlier version so you can restore it.
                </p>
              </>
            ) : (
              <p style={{ color: 'var(--p-muted)' }}>Select an image to see its details and crop it.</p>
            )}
          </aside>
        </div>
      </div>

      {cropping ? <CropDialog image={cropping} onClose={() => setCropping(null)} onCropped={onCropped} /> : null}
    </div>
  );
}
