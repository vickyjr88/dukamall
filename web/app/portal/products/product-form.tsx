"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { portalFetch } from '../portal-api';
import { ImagePicker } from './image-picker';
import { SizeBuilder } from './size-builder';
import { ApiProduct, Category, newRowKey, SizeRow, slugify, suggestSku } from './product-types';

const MAX_IMAGES = 12;
const DESCRIPTION_MAX = 5000;

function rowsFromProduct(product: ApiProduct): SizeRow[] {
  return product.variants.map((v) => ({
    key: newRowKey(),
    id: v.id,
    size: v.size ?? '',
    sku: v.sku,
    skuTouched: true,
    priceKes: String(Number(v.priceKes)),
    priceTouched: true,
    wasPriceKes: v.wasPriceKes ? String(Number(v.wasPriceKes)) : '',
    stockOnHand: String(v.stockOnHand),
    stockTouched: false, // only sent if edited -- see PortalProductService.syncVariants
    isActive: v.isActive,
  }));
}

/**
 * The product editor, used by both /portal/products/new and
 * /portal/products/[id]. With a `product` it edits that product; without one
 * it creates a new one.
 *
 * Saving an existing product is two calls -- PATCH for the product's own
 * fields, then PUT for its size list -- rather than one, because the size
 * list has its own rules (removing a size with orders deactivates it instead
 * of deleting it) and its own response to report back.
 */
export function ProductForm({ product, initialNotice }: { product?: ApiProduct; initialNotice?: string }) {
  const router = useRouter();
  const editing = Boolean(product);

  const [name, setName] = useState(product?.name ?? '');
  const [slug, setSlug] = useState(product?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(editing);
  const [description, setDescription] = useState(product?.description ?? '');
  const [brand, setBrand] = useState(product?.brand ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [isFeatured, setIsFeatured] = useState(product?.isFeatured ?? false);
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [images, setImages] = useState<string[]>(product?.imageUrls ?? []);
  const [rows, setRows] = useState<SizeRow[]>(() => (product ? rowsFromProduct(product) : []));

  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null);

  useEffect(() => {
    portalFetch('/portal/products/categories').then((r) => r.json()).then(setCategories).catch(() => {});
    portalFetch('/portal/products/meta').then((r) => r.json()).then((m) => setBrands(m.brands ?? [])).catch(() => {});
  }, []);

  // The address follows the name until someone edits it by hand -- on a new
  // product only; an existing product's address is never rewritten behind
  // the merchant's back (it is in every link and feed already).
  useEffect(() => {
    if (!editing && !slugTouched) setSlug(slugify(name));
  }, [name, slugTouched, editing]);

  // New rows' generated SKUs follow the product name as it is typed.
  useEffect(() => {
    setRows((current) => current.map((r) => (r.id || r.skuTouched ? r : { ...r, sku: suggestSku(name, r.size) })));
  }, [name]);

  // Unsaved-changes guard.
  const snapshot = useMemo(
    () => JSON.stringify({ name, slug, description, brand, categoryId, isFeatured, isActive, images, rows: rows.map(({ key, ...r }) => r) }),
    [name, slug, description, brand, categoryId, isFeatured, isActive, images, rows],
  );
  const savedSnapshot = useRef<string | null>(null);
  const rebaseNext = useRef(false);
  if (savedSnapshot.current === null || rebaseNext.current) {
    savedSnapshot.current = snapshot;
    rebaseNext.current = false;
  }
  const dirty = snapshot !== savedSnapshot.current;
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function validate(): { problems: string[]; invalid: Set<string> } {
    const list: string[] = [];
    const invalid = new Set<string>();
    if (!name.trim()) list.push('Give the product a name.');
    if (rows.length === 0) list.push('Add at least one size. Use "One size" for an item that doesn\'t come in sizes.');

    const seenSkus = new Map<string, string>();
    const seenSizes = new Set<string>();
    for (const row of rows) {
      const label = row.size.trim() || 'a size';
      if (!row.size.trim()) { list.push('Every size needs a name.'); invalid.add(row.key); }
      if (!row.sku.trim()) { list.push(`${label} needs a SKU.`); invalid.add(row.key); }
      else if (!/^[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(row.sku.trim())) { list.push(`The SKU for ${label} can only use letters, numbers and . _ - /`); invalid.add(row.key); }
      else if (seenSkus.has(row.sku.trim())) { list.push(`SKU "${row.sku.trim()}" is used more than once.`); invalid.add(row.key); invalid.add(seenSkus.get(row.sku.trim())!); }
      else seenSkus.set(row.sku.trim(), row.key);

      const sizeKey = row.size.trim().toLowerCase();
      if (sizeKey && seenSizes.has(sizeKey)) { list.push(`${label} is listed twice.`); invalid.add(row.key); }
      seenSizes.add(sizeKey);

      if (row.priceKes === '' || !(Number(row.priceKes) >= 0)) { list.push(`Set a price for ${label}.`); invalid.add(row.key); }
      if (row.wasPriceKes !== '' && !(Number(row.wasPriceKes) >= 0)) { list.push(`The compare-at price for ${label} isn't a valid amount.`); invalid.add(row.key); }
      if (row.wasPriceKes !== '' && Number(row.wasPriceKes) > 0 && Number(row.wasPriceKes) <= Number(row.priceKes)) {
        list.push(`The compare-at price for ${label} should be higher than its price, or leave it empty.`); invalid.add(row.key);
      }
      if (!/^\d+$/.test(row.stockOnHand.trim() || '0')) { list.push(`Stock for ${label} must be a whole number.`); invalid.add(row.key); }
    }
    return { problems: Array.from(new Set(list)), invalid };
  }

  const invalidKeys = useMemo(() => validate().invalid, [name, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  function variantPayload(row: SizeRow) {
    return {
      ...(row.id ? { id: row.id } : {}),
      sku: row.sku.trim(),
      size: row.size.trim() || undefined,
      priceKes: Number(row.priceKes),
      wasPriceKes: row.wasPriceKes === '' ? null : Number(row.wasPriceKes),
      isActive: row.isActive,
      // Existing sizes only send stock when it was edited; a new size always does.
      ...(!row.id || row.stockTouched ? { stockOnHand: Number(row.stockOnHand.trim() || 0) } : {}),
    };
  }

  async function readError(res: Response, fallback: string): Promise<string> {
    const data = await res.json().catch(() => null);
    const message = data?.message;
    return Array.isArray(message) ? message.join(' ') : message || fallback;
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const check = validate();
    setProblems(check.problems);
    if (check.problems.length) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaving(true);
    try {
      if (!product) {
        const res = await portalFetch('/portal/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            ...(slugTouched && slug.trim() ? { slug: slugify(slug) } : {}),
            description: description.trim() || undefined,
            brand: brand.trim() || undefined,
            categoryId: categoryId || undefined,
            imageUrls: images,
            isFeatured,
            isActive,
            variants: rows.map(variantPayload),
          }),
        });
        if (!res.ok) throw new Error(await readError(res, 'Could not create this product'));
        const created = await res.json();
        savedSnapshot.current = snapshot; // so the unsaved-changes guard doesn't fire on the redirect
        router.push(`/portal/products/${created.id}?created=1`);
        return;
      }

      const patchRes = await portalFetch(`/portal/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: slugify(slug),
          description,
          brand,
          categoryId: categoryId || null,
          imageUrls: images,
          isFeatured,
          isActive,
        }),
      });
      if (!patchRes.ok) throw new Error(await readError(patchRes, 'Could not save the product details'));

      const putRes = await portalFetch(`/portal/products/${product.id}/variants`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variants: rows.map(variantPayload) }),
      });
      if (!putRes.ok) {
        throw new Error(`The product details were saved, but the sizes weren't: ${await readError(putRes, 'could not save the sizes')}`);
      }
      const result: { product: ApiProduct; deactivated: string[] } = await putRes.json();

      // Adopt exactly what the server stored (trimmed names, a normalised
      // address, sizes in their saved order), then take that as the new
      // "saved" baseline for the unsaved-changes guard.
      const saved = result.product;
      setName(saved.name);
      setSlug(saved.slug);
      setDescription(saved.description ?? '');
      setBrand(saved.brand ?? '');
      setCategoryId(saved.categoryId ?? '');
      setIsFeatured(saved.isFeatured);
      setIsActive(saved.isActive);
      setImages(saved.imageUrls);
      setRows(rowsFromProduct(saved));
      rebaseNext.current = true;
      setNotice(
        result.deactivated.length
          ? `Saved. ${result.deactivated.join(', ')} ${result.deactivated.length === 1 ? 'has' : 'have'} orders on record, so ${result.deactivated.length === 1 ? 'it was' : 'they were'} hidden from the shop instead of deleted.`
          : 'Saved.',
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setError(err.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!product) return;
    if (!window.confirm(`Delete "${product.name}"? This can't be undone.`)) return;
    setError(null);
    const res = await portalFetch(`/portal/products/${product.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError(await readError(res, 'Could not delete this product'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    savedSnapshot.current = snapshot;
    router.push('/portal/products');
  }

  function moveImage(index: number, direction: -1 | 1) {
    setImages((current) => {
      const j = index + direction;
      if (j < 0 || j >= current.length) return current;
      const next = current.slice();
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  function addImages(urls: string[]) {
    setImages((current) => [...current, ...urls.filter((u) => !current.includes(u))].slice(0, MAX_IMAGES));
  }

  return (
    <form onSubmit={onSave} noValidate>
      <p style={{ marginBottom: 14 }}><Link href="/portal/products">&larr; All products</Link></p>
      <div className="portal-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h3>{editing ? 'Edit product' : 'New product'}</h3>
        {product ? (
          <a href={`/shop/${product.slug}`} target="_blank" rel="noopener noreferrer" className="portal-btn-outline portal-btn portal-btn-sm">View in shop &nearr;</a>
        ) : null}
      </div>

      {notice ? <div className="portal-alert is-success">{notice}</div> : null}
      {error ? <div className="portal-alert is-error">{error}</div> : null}
      {problems.length ? (
        <div className="portal-alert is-error" role="alert">
          <strong>Please fix the following:</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      ) : null}

      <div className="pe-layout">
        <div className="pe-main">
          <div className="portal-card">
            <h4>Basic information</h4>
            <div className="portal-field">
              <label htmlFor="pe-name">Name</label>
              <input id="pe-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="e.g. Air Max 90 Zig Zag Orange" required />
            </div>
            <div className="portal-field">
              <label htmlFor="pe-description">Description</label>
              <textarea
                id="pe-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={7}
                maxLength={DESCRIPTION_MAX}
                placeholder="What it is, how it fits, what it's made of, how to style it. This shows on the product page and in link previews."
              />
              <span className="hint">{description.length.toLocaleString()} / {DESCRIPTION_MAX.toLocaleString()}. Line breaks are kept.</span>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="portal-field" style={{ flex: '1 1 200px' }}>
                <label htmlFor="pe-brand">Brand</label>
                <input id="pe-brand" value={brand} onChange={(e) => setBrand(e.target.value)} list="pe-brands" maxLength={80} placeholder="e.g. Nike" autoComplete="off" />
                <datalist id="pe-brands">{brands.map((b) => <option key={b} value={b} />)}</datalist>
                <span className="hint">Pick an existing brand where you can &mdash; &ldquo;Nike&rdquo; and &ldquo;nike&rdquo; show up as separate filters.</span>
              </div>
              <div className="portal-field" style={{ flex: '1 1 200px' }}>
                <label htmlFor="pe-category">Category</label>
                <select id="pe-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">No category</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.isActive ? '' : ' (inactive)'}</option>)}
                </select>
                <span className="hint"><Link href="/portal/categories">Manage categories</Link></span>
              </div>
            </div>
            <div className="portal-field">
              <label htmlFor="pe-slug">Web address</label>
              <div className="pe-slug">
                <span>/shop/</span>
                <input
                  id="pe-slug"
                  value={slug}
                  onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
                  placeholder="generated from the name"
                />
              </div>
              <span className="hint">
                {editing
                  ? 'Changing this breaks links people already have to this product, so only do it if you need to.'
                  : 'Made from the name. Edit it if you want something shorter.'}
              </span>
            </div>
          </div>

          <div className="portal-card">
            <h4>Images</h4>
            {images.length === 0 ? (
              <div className="pe-images-empty">
                <p>No images yet. Products with photos sell much better &mdash; and the shop&apos;s product feed skips products that have none.</p>
              </div>
            ) : (
              <ul className="pe-images">
                {images.map((url, index) => (
                  <li key={url} className={index === 0 ? 'is-primary' : ''}>
                    <img src={url} alt="" />
                    {index === 0 ? <span className="pe-primary">Main image</span> : null}
                    <div className="pe-image-actions">
                      <button type="button" onClick={() => moveImage(index, -1)} disabled={index === 0} aria-label="Move earlier">&larr;</button>
                      <button type="button" onClick={() => moveImage(index, 1)} disabled={index === images.length - 1} aria-label="Move later">&rarr;</button>
                      {index !== 0 ? <button type="button" onClick={() => setImages((c) => [url, ...c.filter((u) => u !== url)])} title="Make this the main image">Main</button> : null}
                      <button type="button" onClick={() => setImages((c) => c.filter((u) => u !== url))} aria-label="Remove image">&times;</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
              <button type="button" className="portal-btn-outline portal-btn" onClick={() => setPickerOpen(true)} disabled={images.length >= MAX_IMAGES}>
                {images.length ? 'Add more images' : 'Add images'}
              </button>
              <span style={{ fontSize: 13, color: 'var(--p-muted)' }}>{images.length} of {MAX_IMAGES}. The first image is the main one shown in the shop and in link previews.</span>
            </div>
          </div>

          <div className="portal-card">
            <h4>Sizes &amp; pricing</h4>
            <SizeBuilder rows={rows} onRowsChange={(updater) => setRows(updater)} productName={name} invalid={invalidKeys} />
          </div>
        </div>

        <aside className="pe-side">
          <div className="portal-card">
            <h4>Visibility</h4>
            <label className="pe-check">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              <span><strong>Shown in the shop</strong><br /><span className="hint">Turn off to hide it without deleting anything.</span></span>
            </label>
            <label className="pe-check">
              <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
              <span><strong>Featured</strong><br /><span className="hint">Eligible for featured spots on the shop.</span></span>
            </label>
          </div>

          {product ? (
            <div className="portal-card">
              <h4>Danger zone</h4>
              <p style={{ fontSize: 13, color: 'var(--p-muted)', marginBottom: 10 }}>
                A product with orders or customer enquiries can&apos;t be deleted &mdash; hide it above instead.
              </p>
              <button type="button" className="portal-btn-danger portal-btn portal-btn-sm" onClick={onDelete}>Delete product</button>
            </div>
          ) : null}
        </aside>
      </div>

      <div className="pe-actionbar">
        <span style={{ fontSize: 13, color: dirty ? 'var(--p-warn)' : 'var(--p-muted)' }}>{dirty ? 'Unsaved changes' : editing ? 'All changes saved' : ''}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/portal/products" className="portal-btn-outline portal-btn">{editing ? 'Back' : 'Cancel'}</Link>
          <button type="submit" className="portal-btn" disabled={saving || (editing && !dirty)}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Create product'}
          </button>
        </div>
      </div>

      <ImagePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        alreadyAdded={images}
        remainingSlots={MAX_IMAGES - images.length}
        onAdd={addImages}
      />
    </form>
  );
}
