import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const from=`      const [rawRes, rel] = await Promise.all([
        detailQueryRetry(
          () => supabase.from('products').select('*').eq('id', product.id).single(),
          'sản phẩm',
        ),
        loadProductDetailRelations(product.id),
      ]);
      if (rawRes?.error || !rawRes?.data) throw (rawRes?.error || new Error('Không tìm thấy sản phẩm'));
      if (detailRequestIdRef.current !== requestId) return;
      const rich = buildProducts([rawRes.data], meta.shops || shops, meta.categories || categories, rel.imgs, rel.vars, rel.reviews)[0];
      if (rich) {
        setSelectedAttrs(defaultVariantAttrsForProduct(rich));
        productDetailCacheRef.current.set(product.id, { product: rich, cachedAt: Date.now() });
        setProducts((prev) => prev.some((p:any)=>p.id===rich.id)
          ? prev.map((p:any)=>p.id===rich.id ? rich : p)
          : [rich, ...prev]);
      }`;

const to=`      // Critical path: load the product row, variants/stock, and the full image
      // gallery together. The gallery used to be deferred, so the detail page could render
      // with only products.image_url and appear to have exactly one image.
      const [rawRes, varsRes, imgsRes] = await Promise.all([
        detailQueryRetry(
          () => supabase.from('products').select('*').eq('id', product.id).single(),
          'sản phẩm',
        ),
        detailQueryRetry(
          () => supabase.from('product_variants').select('*').eq('product_id', product.id).order('sort_order',{ascending:true}),
          'phân loại',
        ),
        detailQueryRetry(
          () => supabase.from('product_images').select('*').eq('product_id', product.id).order('sort_order',{ascending:true}),
          'ảnh sản phẩm',
        ),
      ]);
      if (rawRes?.error || !rawRes?.data) throw (rawRes?.error || new Error('Không tìm thấy sản phẩm'));
      if (varsRes?.error) throw varsRes.error;
      if (imgsRes?.error) throw imgsRes.error;
      if (detailRequestIdRef.current !== requestId) return;

      const critical = buildProducts(
        [rawRes.data],
        meta.shops || shops,
        meta.categories || categories,
        (imgsRes?.data || []) as any[],
        (varsRes?.data || []) as any[],
        [],
      )[0];
      if (critical) {
        setSelectedAttrs(defaultVariantAttrsForProduct(critical));
        productDetailCacheRef.current.set(product.id, { product: critical, cachedAt: Date.now() });
        setProducts((prev) => prev.some((p:any)=>p.id===critical.id)
          ? prev.map((p:any)=>p.id===critical.id ? critical : p)
          : [critical, ...prev]);
        // Product, stock and every gallery image are authoritative now. Reviews can refresh later.
        setProductDetailLoading(false);
      }

      // Reviews and any refreshed relation data continue in the background. If this refresh
      // succeeds it replaces the same product with a fully hydrated object, preserving gallery.
      loadProductDetailRelations(product.id).then((rel) => {
        if (detailRequestIdRef.current !== requestId) return;
        const full = buildProducts([rawRes.data], meta.shops || shops, meta.categories || categories, rel.imgs, rel.vars, rel.reviews)[0];
        if (!full) return;
        productDetailCacheRef.current.set(product.id, { product: full, cachedAt: Date.now() });
        setProducts((prev) => prev.some((p:any)=>p.id===full.id)
          ? prev.map((p:any)=>p.id===full.id ? full : p)
          : [full, ...prev]);
      }).catch((e) => console.warn('Đánh giá/quan hệ sản phẩm tải nền chưa xong', e));`;

const count=s.split(from).length-1;
if(count!==1) throw new Error(`[critical-first] openProduct block found ${count} time(s), expected 1`);
s=s.replace(from,to);
writeFileSync(path,s);
console.log('[KIMSHOP FIX] product detail gallery loads before first usable paint');
