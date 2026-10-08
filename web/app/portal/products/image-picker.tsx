"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { authHeaders, portalFetch, PORTAL_API_BASE } from '../portal-api';

type Tile = { url: string; source: 'uploaded' | 'in-use'; label: string };

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];
const MAX_BYTES = 10 * 1024 * 1024;

type UploadState = { name: string; status: 'uploading' | 'done' | 'error'; message?: string };

/**
 * Pick photos for a product: reuse one already in the shop, or upload new
 * ones. "Already in the shop" is two sources merged -- files uploaded into
 * this shop's own storage (GET /media/library) AND every image the shop's
 * products already point at (GET /portal/products/meta). The second matters
 * because the first only sees the shop's own storage, which misses photos
 * that arrived another way (the synced msa catalogue's live on another
 * host) -- and those are the ones most worth reusing.
 *
 * `alreadyAdded` tiles are shown ticked and locked so the same photo can't
 * be added to a product twice.
 */
export function ImagePicker({
  open, onClose, alreadyAdded, remainingSlots, onAdd,
}: {
  open: boolean;
  onClose: () => void;
  alreadyAdded: string[];
  remainingSlots: number;
  onAdd: (urls: string[]) => void;
}) {
  const [tab, setTab] = useState<'library' | 'upload'>('library');
  const [tiles, setTiles] = useState<Tile[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'uploaded' | 'in-use'>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadLibrary = useCallback(async () => {
    const [libraryRes, metaRes] = await Promise.all([
      portalFetch('/media/library?limit=200'),
      portalFetch('/portal/products/meta'),
    ]);
    const merged = new Map<string, Tile>();
    if (libraryRes.ok) {
      for (const image of (await libraryRes.json()) as { url: string }[]) {
        merged.set(image.url, { url: image.url, source: 'uploaded', label: 'Uploaded' });
      }
    }
    if (metaRes.ok) {
      for (const image of ((await metaRes.json()).images ?? []) as { url: string; usedBy: string }[]) {
        // A file that is both uploaded and in use stays "uploaded" -- one tile, not two.
        if (!merged.has(image.url)) merged.set(image.url, { url: image.url, source: 'in-use', label: `On ${image.usedBy}` });
      }
    }
    setTiles(Array.from(merged.values()));
  }, []);

  useEffect(() => {
    if (!open) return;
    setPicked([]); setUploads([]); setTab('library'); setFilter('all');
    loadLibrary();
  }, [open, loadLibrary]);

  // Escape closes, like any modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const room = remainingSlots - picked.length;

  function toggle(url: string) {
    setPicked((current) => {
      if (current.includes(url)) return current.filter((u) => u !== url);
      return remainingSlots - current.length > 0 ? [...current, url] : current;
    });
  }

  async function uploadFiles(files: File[]) {
    const queue = files.slice(0, Math.max(0, room));
    if (queue.length < files.length) {
      setUploads((u) => [...u, { name: `${files.length - queue.length} file(s)`, status: 'error', message: `Only ${remainingSlots} more image${remainingSlots === 1 ? '' : 's'} fit on this product.` }]);
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
        // Uploaded photos are ticked straight away -- the usual next step.
        setTiles((t) => [{ url: data.url, source: 'uploaded', label: 'Uploaded' }, ...(t ?? []).filter((x) => x.url !== data.url)]);
        setPicked((p) => (p.includes(data.url) ? p : [...p, data.url]));
      } catch (e: any) {
        setUploads((u) => u.map((x) => (x.name === file.name && x.status === 'uploading' ? { ...x, status: 'error', message: e.message } : x)));
      }
    }
  }

  const shown = (tiles ?? []).filter((t) => filter === 'all' || t.source === filter);

  return (
    <div className="pe-modal-backdrop" onClick={onClose} role="presentation">
      <div className="pe-modal" role="dialog" aria-modal="true" aria-label="Choose images" onClick={(e) => e.stopPropagation()}>
        <div className="pe-modal-head">
          <h3>Choose images</h3>
          <button type="button" className="portal-btn-ghost" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="portal-tabs" style={{ padding: '0 20px' }}>
          <button type="button" className={tab === 'library' ? 'is-active' : ''} onClick={() => setTab('library')}>Your photos</button>
          <button type="button" className={tab === 'upload' ? 'is-active' : ''} onClick={() => setTab('upload')}>Upload new</button>
        </div>

        <div className="pe-modal-body">
          {tab === 'library' ? (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} style={{ width: 'auto' }} aria-label="Filter photos">
                  <option value="all">All photos</option>
                  <option value="uploaded">Uploaded here</option>
                  <option value="in-use">Already on products</option>
                </select>
                <span style={{ fontSize: 13, color: 'var(--p-muted)' }}>{tiles ? `${shown.length} photo${shown.length === 1 ? '' : 's'}` : 'Loading...'}</span>
              </div>
              {tiles && shown.length === 0 ? (
                <div className="portal-empty">No photos here yet. Use &ldquo;Upload new&rdquo; to add some.</div>
              ) : (
                <div className="pe-tiles">
                  {shown.map((tile) => {
                    const added = alreadyAdded.includes(tile.url);
                    const selected = picked.includes(tile.url);
                    return (
                      <button
                        type="button"
                        key={tile.url}
                        className={`pe-tile${selected ? ' is-selected' : ''}${added ? ' is-added' : ''}`}
                        onClick={() => !added && toggle(tile.url)}
                        disabled={added || (!selected && room <= 0)}
                        title={added ? 'Already on this product' : tile.label}
                      >
                        <img src={tile.url} alt="" loading="lazy" />
                        <span className="pe-tile-label">{added ? 'On this product' : tile.label}</span>
                        {selected || added ? <span className="pe-tile-check" aria-hidden>&#10003;</span> : null}
                      </button>
                    );
                  })}
                </div>
              )}
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
                  multiple
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
              Add {picked.length || ''} image{picked.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
