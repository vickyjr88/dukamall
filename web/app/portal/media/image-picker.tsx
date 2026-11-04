"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { authHeaders, portalFetch, PORTAL_API_BASE } from '../portal-api';
import { CropDialog } from './crop-dialog';
import { MediaItem, MediaLibraryPage, freshUrl, mediaRequest, objectKeyOf } from './media-types';

/** A photo that is in use on a product but is not in this shop's own storage (the synced catalogue's live elsewhere). */
type Elsewhere = { url: string; label: string };

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];
const MAX_BYTES = 10 * 1024 * 1024;

type UploadState = { name: string; status: 'uploading' | 'done' | 'error'; message?: string };

/**
 * Pick photos: reuse one already in the shop, or upload new ones. "Already in the shop" is two sources merged -- the
 * shop's media library (GET /media/library, which can be cropped here) AND every image the shop's products already point
 * at (GET /portal/products/meta). The second matters because the library only sees the shop's own storage, which
 * misses photos that arrived another way (the synced catalogue's live on another host) -- and those are the ones most
 * worth reusing. They cannot be cropped, because the file is not ours to change.
 *
 * Cropping replaces the image in place and keeps its address, so anything already using it shows the crop.
 *
 * `alreadyAdded` tiles are shown ticked and locked so the same photo can't be added twice. `title` and
 * `remainingSlots` let the same picker serve a product gallery (many) and the logo or hero (one).
 */
export function ImagePicker({
  open, onClose, alreadyAdded, remainingSlots, onAdd, title = 'Choose images', confirmLabel,
}: {
  open: boolean;
  onClose: () => void;
  alreadyAdded: string[];
  remainingSlots: number;
  onAdd: (urls: string[]) => void;
  title?: string;
  confirmLabel?: string;
}) {
  const [tab, setTab] = useState<'library' | 'upload'>('library');
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [elsewhere, setElsewhere] = useState<Elsewhere[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'uploaded' | 'elsewhere'>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [dragging, setDragging] = useState(false);
  const [cropping, setCropping] = useState<MediaItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadLibrary = useCallback(async (after?: string) => {
    const params = new URLSearchParams({ limit: '60' });
    if (after) params.set('cursor', after);
    if (search) params.set('search', search);
    try {
      const page = await mediaRequest<MediaLibraryPage>(`/media/library?${params}`);
      setItems((current) => (after ? [...(current ?? []), ...page.items] : page.items));
      setCursor(page.nextCursor);
      setTotal(page.total);
    } catch (e: any) {
      setError(e.message);
      setItems((current) => current ?? []);
    }
  }, [search]);

  // Photos on products that live outside this shop's storage; fetched once per opening.
  useEffect(() => {
    if (!open) return;
    setPicked([]); setUploads([]); setTab('library'); setFilter('all'); setSearchText(''); setSearch(''); setError(null);
    void (async () => {
      const res = await portalFetch('/portal/products/meta');
      if (!res.ok) return;
      const images = ((await res.json()).images ?? []) as { url: string; usedBy: string }[];
      setElsewhere(images.filter((image) => !/\/media\//.test(image.url)).map((image) => ({ url: image.url, label: `On ${image.usedBy}` })));
    })();
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    if (open) void loadLibrary();
  }, [open, loadLibrary]);

  // Escape closes, like any modal -- unless the crop dialog is on top, which handles its own Escape.
  useEffect(() => {
    if (!open || cropping) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, cropping]);

  if (!open) return null;

  const room = remainingSlots - picked.length;
  const isAdded = (url: string) => alreadyAdded.some((added) => objectKeyOf(added) === objectKeyOf(url));
  const isPicked = (url: string) => picked.some((p) => objectKeyOf(p) === objectKeyOf(url));

  function toggle(url: string) {
    setPicked((current) => {
      if (current.some((p) => objectKeyOf(p) === objectKeyOf(url))) return current.filter((p) => objectKeyOf(p) !== objectKeyOf(url));
      return remainingSlots - current.length > 0 ? [...current, url] : current;
    });
  }

  function replaceItem(updated: MediaItem) {
    setItems((current) => (current ?? []).map((item) => (item.id === updated.id ? updated : item)));
  }

  async function makeSquare(item: MediaItem) {
    if (!window.confirm('Make this photo square? It is cropped to a centred square and replaces the photo everywhere it is used. You can restore the earlier version from Media.')) return;
    setError(null);
    try {
      replaceItem(await mediaRequest<MediaItem>('/media/crop', { method: 'POST', body: { assetId: item.id, square: true } }));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function uploadFiles(files: File[]) {
    const queue = files.slice(0, Math.max(0, room));
    if (queue.length < files.length) {
      setUploads((u) => [...u, { name: `${files.length - queue.length} file(s)`, status: 'error', message: `Only ${remainingSlots} more image${remainingSlots === 1 ? '' : 's'} fit here.` }]);
    }
    for (const file of queue) {
      // Checked here for a fast, specific message; the server checks the real
      // file contents regardless of what the browser claims.
      if (!ACCEPTED.includes(file.type)) {
        setUploads((u) => [...u, { name: file.name, status: 'error', message: 'Use a PNG, JPEG, WebP, GIF or AVIF image.' }]);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setUploads((u) => [...u, { name: file.name, status: 'error', message: 'Larger than 10 MB.' }]);
        continue;
      }
      setUploads((u) => [...u, { name: file.name, status: 'uploading' }]);
      try {
        const body = new FormData();
        body.append('file', file);
        const res = await fetch(`${PORTAL_API_BASE}/media/upload`, { method: 'POST', headers: authHeaders(), body });
        const data = await res.json();
        if (!res.ok) throw new Error(Array.isArray(data?.message) ? data.message[0] : data?.message || 'Upload failed');
        setUploads((u) => u.map((x) => (x.name === file.name && x.status === 'uploading' ? { ...x, status: 'done' } : x)));
        const now = new Date().toISOString();
        const added: MediaItem = {
          id: data.id ?? data.objectKey, objectKey: data.objectKey, url: data.url, fileName: data.fileName, contentType: data.contentType,
          sizeBytes: data.sizeBytes ?? file.size, width: data.width, height: data.height, uploadedAt: now, updatedAt: now, hasPreviousVersion: false,
        };
        // Uploaded photos are ticked straight away -- the usual next step.
        setItems((current) => [added, ...(current ?? []).filter((x) => x.id !== added.id)]);
        setTotal((t) => t + 1);
        setPicked((p) => (p.some((x) => objectKeyOf(x) === objectKeyOf(data.url)) ? p : [...p, data.url]));
      } catch (e: any) {
        setUploads((u) => u.map((x) => (x.name === file.name && x.status === 'uploading' ? { ...x, status: 'error', message: e.message } : x)));
      }
    }
  }

  const showLibrary = filter !== 'elsewhere';
  const showElsewhere = filter !== 'uploaded' && !search;
  const libraryItems = showLibrary ? items ?? [] : [];
  const elsewhereItems = showElsewhere ? elsewhere : [];
  const shownCount = libraryItems.length + elsewhereItems.length;

  return (
    <>
    <div className="pe-modal-backdrop" onClick={onClose} role="presentation">
      <div className="pe-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="pe-modal-head">
          <h3>{title}</h3>
          <button type="button" className="portal-btn-ghost" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="portal-tabs" style={{ padding: '0 20px' }}>
          <button type="button" className={tab === 'library' ? 'is-active' : ''} onClick={() => setTab('library')}>Your photos</button>
          <button type="button" className={tab === 'upload' ? 'is-active' : ''} onClick={() => setTab('upload')}>Upload new</button>
        </div>

        <div className="pe-modal-body">
          {error ? <div className="portal-alert is-error">{error}</div> : null}
          {tab === 'library' ? (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="search"
                  placeholder="Search by file name…"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  aria-label="Search photos by file name"
                  style={{ flex: '1 1 180px', minWidth: 0 }}
                />
                <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} style={{ width: 'auto' }} aria-label="Filter photos">
                  <option value="all">All photos</option>
                  <option value="uploaded">Uploaded here</option>
                  <option value="elsewhere">Synced from elsewhere</option>
                </select>
                <span style={{ fontSize: 13, color: 'var(--p-muted)' }}>
                  {items ? `${showLibrary ? total : 0} photo${total === 1 && showLibrary ? '' : 's'}${elsewhereItems.length ? ` + ${elsewhereItems.length} synced` : ''}` : 'Loading...'}
                </span>
              </div>
              {items && shownCount === 0 ? (
                <div className="portal-empty">{search ? 'No photo matches that name.' : 'No photos here yet. Use “Upload new” to add some.'}</div>
              ) : (
                <div className="pe-tiles">
                  {libraryItems.map((item) => {
                    const added = isAdded(item.url);
                    const selected = isPicked(item.url);
                    return (
                      <div className="pm-tile" key={item.id}>
                        <button
                          type="button"
                          className={`pe-tile${selected ? ' is-selected' : ''}${added ? ' is-added' : ''}`}
                          onClick={() => !added && toggle(item.url)}
                          disabled={added || (!selected && room <= 0)}
                          title={added ? 'Already added' : item.fileName}
                        >
                          <img src={freshUrl(item)} alt="" loading="lazy" />
                          <span className="pe-tile-label">{added ? 'Already added' : item.fileName}</span>
                          {selected || added ? <span className="pe-tile-check" aria-hidden>&#10003;</span> : null}
                        </button>
                        {item.hasPreviousVersion ? <span className="pm-badge">Cropped</span> : null}
                        <div className="pm-actions">
                          <button type="button" className="pm-action" onClick={() => setCropping(item)} title="Crop this photo">Crop</button>
                          <button type="button" className="pm-action" onClick={() => void makeSquare(item)} title="Crop to a centred square">Square</button>
                        </div>
                      </div>
                    );
                  })}
                  {elsewhereItems.map((tile) => {
                    const added = isAdded(tile.url);
                    const selected = isPicked(tile.url);
                    return (
                      <div className="pm-tile" key={tile.url}>
                        <button
                          type="button"
                          className={`pe-tile${selected ? ' is-selected' : ''}${added ? ' is-added' : ''}`}
                          onClick={() => !added && toggle(tile.url)}
                          disabled={added || (!selected && room <= 0)}
                          title={added ? 'Already added' : `${tile.label} (hosted elsewhere, cannot be cropped here)`}
                        >
                          <img src={tile.url} alt="" loading="lazy" />
                          <span className="pe-tile-label">{added ? 'Already added' : tile.label}</span>
                          {selected || added ? <span className="pe-tile-check" aria-hidden>&#10003;</span> : null}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {cursor && showLibrary ? (
                <div style={{ marginTop: 12, textAlign: 'center' }}>
                  <button
                    type="button"
                    className="portal-btn portal-btn-outline"
                    disabled={loadingMore}
                    onClick={async () => { setLoadingMore(true); await loadLibrary(cursor); setLoadingMore(false); }}
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div
                className={`pe-drop${dragging ? ' is-dragging' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); void uploadFiles(Array.from(e.dataTransfer.files)); }}
                onClick={() => fileInput.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click(); }}
              >
                <strong>Drop photos here</strong>
                <span>or click to choose files &middot; PNG, JPEG, WebP, GIF or AVIF, up to 10 MB each</span>
                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPTED.join(',')}
                  multiple={remainingSlots > 1}
                  hidden
                  onChange={(e) => { void uploadFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
                />
              </div>
              {uploads.length > 0 ? (
                <ul className="pe-uploads">
                  {uploads.map((u, i) => (
                    <li key={`${u.name}-${i}`} className={`is-${u.status}`}>
                      <span>{u.name}</span>
                      <span>{u.status === 'uploading' ? 'Uploading...' : u.status === 'done' ? 'Added ✓' : u.message}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>

        <div className="pe-modal-foot">
          <span style={{ fontSize: 13, color: 'var(--p-muted)' }}>
            {picked.length} selected &middot; {Math.max(0, room)} more can be added
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="portal-btn-outline portal-btn" onClick={onClose}>Cancel</button>
            <button type="button" className="portal-btn" disabled={picked.length === 0} onClick={() => { onAdd(picked); onClose(); }}>
              {confirmLabel ?? `Add ${picked.length || ''} image${picked.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* A sibling, not a child: React events bubble through the tree, so a click in the crop dialog would close the picker. */}
    {cropping ? (
      <CropDialog
        image={cropping}
        onClose={() => setCropping(null)}
        onCropped={(updated) => { setCropping(null); replaceItem(updated); }}
      />
    ) : null}
    </>
  );
}
