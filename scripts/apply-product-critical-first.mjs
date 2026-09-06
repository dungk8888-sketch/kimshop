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

const to=`      // Critical path: product row + variants/stock are the only data required to
      // make the detail page purchasable. Do not block them behind images/reviews.
      const [rawRes, varsRes] = await Promise.all([
        detailQueryRetry(
          () => supabase.from('products').select('*').eq('id', product.id).single(),
          'sản phẩm',
        ),
        detailQueryRetry(
          () => supabase.from('product_variants').select('*').eq('product_id', product.id).order('sort_order',{ascending:true}),
          'phân loại',
        ),
      ]);
      if (rawRes?.error || !rawRes?.data) throw (rawRes?.error || new Error('Không tìm thấy sản phẩm'));
      if (varsRes?.error) throw varsRes.error;
      if (detailRequestIdRef.current !== requestId) return;

      const critical = buildProducts(
        [rawRes.data],
        meta.shops || shops,
        meta.categories || categories,
        [],
        (varsRes?.data || []) as any[],
        [],
      )[0];
      if (critical) {
        setSelectedAttrs(defaultVariantAttrsForProduct(critical));
        productDetailCacheRef.current.set(product.id, { product: critical, cachedAt: Date.now() });
        setProducts((prev) => prev.some((p:any)=>p.id===critical.id)
          ? prev.map((p:any)=>p.id===critical.id ? critical : p)
          : [critical, ...prev]);
        // Variant/stock is authoritative now. Purchase UI can become interactive immediately.
        setProductDetailLoading(false);
      }

      // Non-critical extras continue in the background. This intentionally may re-read
      // variants once in loadProductDetailRelations; it avoids delaying the first usable
      // paint and keeps the existing review-name/image mapping logic untouched.
      loadProductDetailRelations(product.id).then((rel) => {
        if (detailRequestIdRef.current !== requestId) return;
        const full = buildProducts([rawRes.data], meta.shops || shops, meta.categories || categories, rel.imgs, rel.vars, rel.reviews)[0];
        if (!full) return;
        productDetailCacheRef.current.set(product.id, { product: full, cachedAt: Date.now() });
        setProducts((prev) => prev.some((p:any)=>p.id===full.id)
          ? prev.map((p:any)=>p.id===full.id ? full : p)
          : [full, ...prev]);
      }).catch((e) => console.warn('Ảnh/đánh giá sản phẩm tải nền chưa xong', e));`;

const count=s.split(from).length-1;
if(count!==1) throw new Error(`[critical-first] openProduct block found ${count} time(s), expected 1`);
s=s.replace(from,to);
writeFileSync(path,s);
console.log('[KIMSHOP PERF] product critical-first hydration applied');
