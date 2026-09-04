# KIMSHOP - TASK FOR CLAUDE

## Current bugs to fix

1. Adding a product can show: `1 số dữ liệu chưa được tải vui lòng thử lại`, then the page may become completely white. After reloading, the product actually exists in Supabase.
2. Editing a product can report failure even though the write was persisted.
3. Deleting a product can report failure, but after reload the product is actually deleted (soft delete).
4. Repeated save attempts previously created duplicate products.

## Important architecture

`src/App.tsx` in Git is only a placeholder. The real App source is generated during `predev` / `prebuild` by `scripts/assemble-app.mjs` from `source_parts/*` plus patch/apply scripts.

Run:

```bash
npm install
npm run build
```

Then inspect the generated `src/App.tsx`.

Fix the source / assembly pipeline, not only the generated file.

## Required behavior

- Separate persistence success from post-write refresh success.
- Create/update must be idempotent. Once `products.upsert(...).select().single()` succeeds and returns an id, retries must not create a second product.
- Save product + images + variants safely.
- If only `loadRemoteData()` or relation refresh fails after writes succeeded, show success and keep the UI usable.
- If images/variants fail after the product row exists, preserve the same product id and report a specific partial-sync issue rather than encouraging a duplicate retry.
- Delete: once `status='deleted'` update succeeds, remove the product from local state and show success. A background refresh error must not turn delete into failure.
- Find the exact source of relation / `loadRemoteData()` failures involving `product_images`, `product_variants`, or other catalog data.
- Guard against null/undefined relation arrays and partial responses.
- Fix the white screen after adding a product. Check optimistic object shape and render assumptions; do not just suppress the error.
- Do not regress checkout, product variants, seller/admin permissions, AI variant prices, or soft-delete behavior.

## Useful search points

Search the generated `src/App.tsx` for:

- `loadRemoteData`
- `const saveProduct`
- `const deleteProduct`
- `product_images`
- `product_variants`
- `1 số dữ liệu chưa được tải`
- `setProducts`
- `goSellerPage('products')`

Review `scripts/apply-product-save-safety.mjs`; recent fixes there were regex patches and should be replaced/cleaned up if needed rather than layering more fragile patches.

## Final tests

1. Add one product once -> exactly one DB row, success UI, no white page.
2. Reload -> same single product exists with images/variants.
3. Edit -> success immediately, persisted after reload.
4. Delete -> disappears immediately, stays deleted after reload.
5. Simulate a relation refresh failure -> CRUD still reports the correct persistence status and the app remains usable.

Do not deploy production automatically. Return a complete repaired project ZIP for review first.
