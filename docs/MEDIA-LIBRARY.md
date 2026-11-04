# Media library

Portal > **Media** is every image in the shop in one place. Upload (several at once, or drag and drop), search by file name,
crop, and copy a link. The same library feeds the **Add images** picker on a product and **Choose from your photos** on the
Theme page (logo and home hero), so a photo uploaded once can be used anywhere.

Each shop sees only its own images: files live under `{shopId}/` in the object store, every query is scoped to the shop in the
login token, and an image id from another shop is answered "not found", exactly like one that does not exist.

## Cropping replaces the image

Cropping changes the image itself. It keeps its address, so every product, the logo and the hero already using it show the
cropped picture, and nothing needs re-linking. There is one image in the library, not two.

- **Crop** opens a box you drag and resize, with shape presets (Free, Square 1:1, Original shape, 4:5, 3:4, 4:3, 16:9). A live
  readout shows the pixel size and warns when the result is small.
- **Make square** is one click: the largest centred square, confirmed first. To choose *which part* is kept, use Crop > Square 1:1
  and drag the box.
- **Restore previous version** undoes the last crop and puts back the earlier picture exactly. The picture as it was before each
  crop is kept (the last 5 per image) under `{shopId}/versions/`, never listed as a library image and not reachable by URL.
- In the picker, each of the shop's own photos has **Crop** and **Square** buttons; after cropping, the photo is used straight away.
- Photos that arrive from the synced Drip Emporium catalogue are hosted elsewhere, so they appear in the picker (filter: *Synced
  from elsewhere*) and can be chosen, but not cropped. To crop one, upload a copy.
- A camera photo is cropped as it appears (its rotation is respected). JPEG, PNG, WebP and AVIF keep their format; a GIF becomes
  PNG (an animated GIF loses its animation, which Restore brings back).

## How it works

| Piece | Where |
|---|---|
| Table `MediaAsset` (shop, name, size, dimensions, previous versions) | `backend/prisma/schema.prisma`, migration `20261105100000_add_media_asset` |
| Upload, library list + search, crop, restore | `backend/src/media/media.service.ts` and `media.controller.ts` |
| Media manager page | `web/app/portal/media/page.tsx` |
| Picker used by every photo field | `web/app/portal/media/image-picker.tsx` |
| Crop dialog | `web/app/portal/media/crop-dialog.tsx` |

API: `GET /media/library?search=&cursor=`, `POST /media/upload`, `POST /media/crop` (`{assetId, x, y, width, height}` or
`{assetId, square: true}`), `POST /media/restore` (`{assetId}`), and the public `GET /media/{shopId}/{file}` the storefront uses.

- **Existing images.** Anything a shop uploaded before this table existed is added to its library the first time it opens the
  library (at most every 30 seconds per shop). Their name is the stored file name, since the original was never kept.
- **Uploads** are still checked by their real bytes (PNG, JPEG, WebP, GIF, AVIF; never SVG), up to 10 MB.
- **Caching.** An image keeps its address after a crop, so the image route sends `Cache-Control: no-cache` with an `ETag`: browsers
  and CDNs check back and get either "not modified" (cheap) or the new picture. The storefront does not use Next's image
  optimiser (`unoptimized: true`), so a crop shows as soon as the browser revalidates. The portal adds a version marker (`?v=`)
  only for what it *displays*; what is saved in a product or the theme is always the plain address.
- **Cropping is destructive until restored.** It changes the picture everywhere it is used, which is the point; the confirm text
  and the dialog say so.

## Deploying

The backend now depends on `sharp` (a native image library; the Alpine build installs its prebuilt musl binary), so the backend
image must be rebuilt, not just restarted. The deploy applies the migration (`prisma migrate deploy` in the entrypoint). Then
open Portal > Media once per shop to import its existing images.

## Not included

Deleting images, renaming them, and showing where an image is used are not part of this.

## Tests

`npm test` runs `test/unit/media-library.spec.ts`: crop in place, previous versions and restore, one-click square, format
handling, rotation, refused crops, search and paging, the backfill, ETag revalidation, and shop isolation (library, crop,
restore and file reads across two shops).
