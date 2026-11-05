"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { portalFetch } from '../portal-api';
import { useSession } from '../portal-session';
import { ImagePicker } from '../media/image-picker';
import { SizeBuilder } from './size-builder';
import { OptionsBuilder } from './options-builder';
import { SpecsEditor } from './specs-editor';
import { ApiProduct, Category, newRowKey, optionLabel, SectionInfo, SizeRow, slugify, Spec, suggestOptionSku, suggestSku } from './product-types';

const MAX_IMAGES = 12;
const DESCRIPTION_MAX = 5000;

function rowsFromProduct(product: ApiProduct): SizeRow[] {
  return product.variants.map((v) => ({
    key: newRowKey(),
    id: v.id,
    // A variant that was saved with options keeps them (its label is its options, "128GB / Black / New"); one saved the
    // old way is just a size until its category says otherwise.
    ...(v.attributes && Object.keys(v.attributes).length ? { attributes: v.attributes } : {}),
    size: v.attributes && Object.keys(v.attributes).length ? optionLabel(v.attributes) : v.size ?? '',
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
 * Moves a product's rows between the two ways of entering variants when its category's section decides it should be the
 * other: a plain size becomes a "size" option (and back), and nothing already priced or counted changes.
 */
function convertRows(rows: SizeRow[], toOptions: boolean, section?: SectionInfo): SizeRow[] {
  const hasSizeAxis = Boolean(section?.axes.some((a) => a.key === 'size'));
  return rows.map((row) => {
    if (toOptions) {
      if (row.attributes) return row;
      const attributes: Record<string, string> = hasSizeAxis && row.size.trim() ? { size: row.size.trim() } : {};
      return { ...row, attributes, size: optionLabel(attributes) };
    }
    if (!row.attributes) return row;
    const { attributes, ...rest } = row;
    const label = optionLabel(attributes);
    return { ...rest, size: label === 'Standard' ? 'One size' : label };
  });
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
  const { isOwner } = useSession();
  const editing = Boolean(product);

  const [name, setName] = useState(product?.name ?? '');
  const [slug, setSlug] = useState(product?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(editing);
  const [description, setDescription] = useState(product?.description ?? '');
  const [seoTitle, setSeoTitle] = useState(product?.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = useState(product?.seoDescription ?? '');
  const [brand, setBrand] = useState(product?.brand ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [isFeatured, setIsFeatured] = useState(product?.isFeatured ?? false);
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [images, setImages] = useState<string[]>(product?.imageUrls ?? []);
  const [rows, setRows] = useState<SizeRow[]>(() => (product ? rowsFromProduct(product) : []));
  // What the shop pays for one item. Private: it only ever feeds the profit figures on the Analytics page.
  const [cost, setCost] = useState(() => (product?.costKes != null ? String(Number(product.costKes)) : ''));
  const [specs, setSpecs] = useState<Spec[]>(() => (product?.specs ?? []).map((x) => ({ label: x.label, value: x.value })));
  const [sections, setSections] = useState<SectionInfo[]>([]);
  const [categoriesReady, setCategoriesReady] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null);

  useEffect(() => {
    Promise.all([
      portalFetch('/portal/products/categories').then((r) => r.json()).then(setCategories).catch(() => {}),
      portalFetch('/portal/sections').then((r) => r.json()).then((d) => setSections(d.sections ?? [])).catch(() => {}),
    ]).finally(() => setCategoriesReady(true));
    portalFetch('/portal/products/meta').then((r) => r.json()).then((m) => setBrands(m.brands ?? [])).catch(() => {});
  }, []);

  // The category decides how a product's variants are entered: shoes and categories from before sections use the size
  // table; every other section (clothes, watches, electronics, devices) uses options. Shoes stay as they were.
  const section = useMemo(() => {
    const category = categories.find((c) => c.id === categoryId);
    return category?.section ? sections.find((x) => x.key === category.section) : undefined;
  }, [categories, categoryId, sections]);
  const usesOptions = Boolean(section && section.key !== 'footwear');

  // Once the categories are known, an existing product's rows are put in the right form. That is not an edit, so the
  // unsaved-changes guard is told to take the converted form as its starting point.
  const converted = useRef(false);
  useEffect(() => {
    if (!categoriesReady || converted.current) return;
    converted.current = true;
    if (!product) return;
    setRows((current) => convertRows(current, usesOptions, section));
    rebaseNext.current = true;
  }, [categoriesReady]); // eslint-disable-line react-hooks/exhaustive-deps

  function onCategoryChange(id: string) {
    setCategoryId(id);
    const next = categories.find((c) => c.id === id);
    const nextSection = next?.section ? sections.find((x) => x.key === next.section) : undefined;
    setRows((current) => convertRows(current, Boolean(nextSection && nextSection.key !== 'footwear'), nextSection));
  }

  // The address follows the name until someone edits it by hand -- on a new
  // product only; an existing product's address is never rewritten behind
  // the merchant's back (it is in every link and feed already).
  useEffect(() => {
    if (!editing && !slugTouched) setSlug(slugify(name));
  }, [name, slugTouched, editing]);

  // New rows' generated SKUs follow the product name as it is typed.
  useEffect(() => {
    setRows((current) => current.map((r) => (r.id || r.skuTouched ? r : { ...r, sku: r.attributes ? suggestOptionSku(name, r.attributes) : suggestSku(name, r.size) })));
  }, [name]);

  // Unsaved-changes guard.
  const snapshot = useMemo(
    () => JSON.stringify({ name, slug, description, seoTitle, seoDescription, brand, categoryId, isFeatured, isActive, images, specs, cost, rows: rows.map(({ key, ...r }) => r) }),
    [name, slug, description, seoTitle, seoDescription, brand, categoryId, isFeatured, isActive, images, specs, cost, rows],
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
    if (cost.trim() !== '' && !(Number(cost) >= 0)) list.push('What you pay for it must be an amount, or leave it empty.');
    if (rows.length === 0) {
      list.push(usesOptions ? 'Add the product with its options, or with no options, so it has a price.' : 'Add at least one size. Use "One size" for an item that doesn\'t come in sizes.');
    }

    const seenSkus = new Map<string, string>();
    const seenSizes = new Set<string>();
    for (const row of rows) {
      const label = row.size.trim() || 'a size';
      if (!row.size.trim()) { list.push('Every size needs a name.'); invalid.add(row.key); }
      if (!row.sku.trim()) { list.push(`${label} needs a SKU.`); invalid.add(row.key); }
      else if (!/^[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(row.sku.trim())) { list.push(`The SKU for ${label} can only use letters, numbers and . _ - /`); invalid.add(row.key); }
      else if (seenSkus.has(row.sku.trim())) { list.push(`SKU "${row.sku.trim()}" is used more than once.`); invalid.add(row.key); invalid.add(seenSkus.get(row.sku.trim())!); }
      else seenSkus.set(row.sku.trim(), row.key);

      // A required option (a shirt's size) must be filled on every line.
      for (const axis of section?.axes ?? []) {
        if (axis.required && row.attributes && !(row.attributes[axis.key] ?? '').trim()) { list.push(`${label} needs a ${axis.label.toLowerCase()}.`); invalid.add(row.key); }
      }

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

  const invalidKeys = useMemo(() => validate().invalid, [name, rows, section]); // eslint-disable-line react-hooks/exhaustive-deps

  function variantPayload(row: SizeRow) {
    return {
      ...(row.id ? { id: row.id } : {}),
      sku: row.sku.trim(),
      // A line with options sends those (the server mirrors a "size" option into the size column); a plain size row sends its size.
      ...(row.attributes ? { attributes: row.attributes } : { size: row.size.trim() || undefined }),
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
            seoTitle: seoTitle.trim() || undefined,
            seoDescription: seoDescription.trim() || undefined,
            brand: brand.trim() || undefined,
            categoryId: categoryId || undefined,
            imageUrls: images,
            specs: specs.filter((x) => x.label.trim() || x.value.trim()),
            ...(cost.trim() !== '' ? { costKes: Number(cost) } : {}),
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
          seoTitle,
          seoDescription,
          brand,
          categoryId: categoryId || null,
          imageUrls: images,
          specs: specs.filter((x) => x.label.trim() || x.value.trim()),
          costKes: cost.trim() === '' ? null : Number(cost),
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
      setSeoTitle(saved.seoTitle ?? '');
      setSeoDescription(saved.seoDescription ?? '');
      setBrand(saved.brand ?? '');
      setCategoryId(saved.categoryId ?? '');
      setIsFeatured(saved.isFeatured);
      setIsActive(saved.isActive);
      setImages(saved.imageUrls);
      setSpecs((saved.specs ?? []).map((x) => ({ label: x.label, value: x.value })));
      setCost(saved.costKes != null ? String(Number(saved.costKes)) : '');
      setRows(convertRows(rowsFromProduct(saved), usesOptions, section));
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
          <a href={`/shop/${product.slug}`} target="_blank" rel="noopener noreferrer" className="portal-btn-outline portal-btn portal-btn-sm">View in shop {'\u2197'}</a>
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
                <select id="pe-category" value={categoryId} onChange={(e) => onCategoryChange(e.target.value)}>
                  <option value="">No category</option>
                  {[...sections.map((x) => ({ key: x.key, label: x.label })), { key: '', label: 'Other' }].map((group) => {
                    const inGroup = categories.filter((c) => (c.section ?? '') === group.key);
                    return inGroup.length ? (
                      <optgroup key={group.key || 'other'} label={group.label}>
                        {inGroup.map((c) => <option key={c.id} value={c.id}>{c.name}{c.isActive ? '' : ' (inactive)'}</option>)}
                      </optgroup>
                    ) : null;
                  })}
                </select>
                <span className="hint">
                  {section ? <>Filed under <strong>{section.label}</strong>: this decides the options below. </> : 'The category decides which options a product has. '}
                  <Link href="/portal/categories">Manage categories</Link>{sections.some((x) => !x.enabled) ? <> &middot; <Link href="/portal/sections">What you sell</Link></> : null}
                </span>
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
            <h4>Search &amp; sharing</h4>
            <p className="hint" style={{ marginTop: 0 }}>Optional. How this product reads in Google and in WhatsApp previews. Leave blank to use the name and description.</p>
            <div className="portal-field">
              <label htmlFor="pe-seo-title">Page title</label>
              <input id="pe-seo-title" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} maxLength={70} placeholder={name ? `${name} | your shop` : ''} />
              <span className="hint">{seoTitle.length} / 70</span>
            </div>
            <div className="portal-field">
              <label htmlFor="pe-seo-description">Page description</label>
              <textarea id="pe-seo-description" rows={3} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} maxLength={300} placeholder={description.trim().slice(0, 160)} />
              <span className="hint">{seoDescription.length} / 300 &mdash; about 160 shows in full.</span>
            </div>
          </div>

          <div className="portal-card">
            <h4>{usesOptions ? (section!.axes.length ? 'Options & pricing' : 'Pricing & stock') : 'Sizes & pricing'}</h4>
            {usesOptions ? (
              <OptionsBuilder rows={rows} onRowsChange={(updater) => setRows(updater)} productName={name} invalid={invalidKeys} axes={section!.axes} noun={section!.key === 'watches' ? 'the watch' : 'the product'} />
            ) : (
              <SizeBuilder rows={rows} onRowsChange={(updater) => setRows(updater)} productName={name} invalid={invalidKeys} />
            )}
          </div>

          <div className="portal-card">
            <h4>Your cost (private)</h4>
            <div className="portal-field" style={{ marginBottom: 0, maxWidth: 260 }}>
              <label htmlFor="pe-cost">What you pay for one (KES)</label>
              <input id="pe-cost" type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="e.g. 2600" />
              <span className="hint">Shoppers never see this. It lets Analytics show your profit, not just your sales.</span>
            </div>
          </div>

          {section || specs.length ? (
            <div className="portal-card">
              <h4>Specifications</h4>
              <p className="hint" style={{ marginTop: 0 }}>Shown as a table on the product page. Add only what applies.</p>
              <SpecsEditor specs={specs} onChange={setSpecs} suggestions={section?.specs ?? []} />
            </div>
          ) : null}
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

          {product && isOwner ? (
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
