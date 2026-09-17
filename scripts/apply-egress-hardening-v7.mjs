import fs from 'node:fs';

const file = 'src/App.tsx';
let s = fs.readFileSync(file, 'utf8');
let changes = 0;

// 1) V5 still fetched image_url one product at a time. On the legacy DB many image_url
// values are data:image/...;base64,... and a six-card home page can therefore download
// tens of MB. Storefront must only ask PostgREST for URL-backed images.
const coverStart = '  // At most two cover requests at once. A bad/slow image must NEVER blank the catalog.\n';
const coverEnd = '  return { rawProducts, total:Number(count||0) };\n';
const a = s.indexOf(coverStart);
const b = s.indexOf(coverEnd, a);
if (a >= 0 && b > a) {
  const replacement = `  // [EGRESS V7] Storefront NEVER downloads legacy base64 image fields.\n  // Fetch only URL-backed product covers in one tiny request. Rows whose image_url is\n  // data:image/... are filtered server-side, so the large text never leaves Postgres.\n  if(missingIds.length){\n    try{\n      const r:any=await supabase.from('products')\n        .select('id,image_url,updated_at')\n        .in('id',missingIds)\n        .not('image_url','like','data:%');\n      if(!r?.error){\n        const byId=new Map((r?.data||[]).map((p:any)=>[String(p.id),p]));\n        for(const row of rawProducts){\n          const cover:any=byId.get(String(row.id));\n          if(cover?.image_url) row.image_url=cover.image_url;\n        }\n      }\n    }catch(e){ console.warn('[EGRESS V7] url cover fetch failed',e); }\n\n    // For products whose main image is still base64, try a URL-backed gallery image.\n    const stillMissing=rawProducts.filter((p:any)=>!String(p.image_url||'')).map((p:any)=>String(p.id));\n    if(stillMissing.length){\n      try{\n        const g:any=await supabase.from('product_images')\n          .select('product_id,public_url,sort_order')\n          .in('product_id',stillMissing)\n          .not('public_url','like','data:%')\n          .order('sort_order',{ascending:true});\n        if(!g?.error){\n          const firstByProduct=new Map();\n          for(const img of (g?.data||[])){\n            const id=String(img.product_id||'');\n            if(id && img.public_url && !firstByProduct.has(id)) firstByProduct.set(id,img.public_url);\n          }\n          for(const row of rawProducts){\n            if(!row.image_url){ const fallback=firstByProduct.get(String(row.id)); if(fallback) row.image_url=fallback; }\n          }\n        }\n      }catch(e){ console.warn('[EGRESS V7] gallery url fallback failed',e); }\n    }\n  }\n\n`;
  s = s.slice(0, a) + replacement + s.slice(b);
  changes++;
} else {
  console.log('[EGRESS V7] V5 cover block already changed or not found');
}

// 2) Older storefront code may still enrich every page with product_images / variants /
// reviews after the light product query. Remove those enrichments only on home/filter/load-more.
const exactBlocks = [
`        loadProductRelations(page.rawProducts).then(({imgs,vars,reviews})=>{\n          if(cancelled || storefrontQueryGenRef.current!==myGen) return;\n          setProducts(buildProducts(page.rawProducts,shops,categories,imgs,vars,reviews));\n        }).catch((e)=>console.error('Không tải được quan hệ sản phẩm',e));`,
`      const rel=await loadProductRelations(page.rawProducts);\n      if(dead || storefrontQueryGenRef.current!==gen) return;\n      setProducts(buildProducts(page.rawProducts,meta.shops,meta.categories,rel.imgs,rel.vars,rel.reviews));`,
`      const rel=await loadProductRelations(page.rawProducts);\n      if(storefrontQueryGenRef.current!==gen) return;\n      const rich=buildProducts(page.rawProducts,meta.shops,meta.categories,rel.imgs,rel.vars,rel.reviews);\n      setProducts(prev=>prev.map(p=>rich.find(r=>r.id===p.id)||p));`
];
for(const block of exactBlocks){
  if(s.includes(block)){
    s=s.replace(block,'      // [EGRESS V7] relations load on product detail only');
    changes++;
  }
}

// Safety assertion: the V7-specific URL-only filter must be present after patching.
if(!s.includes(".not('image_url','like','data:%')")) {
  throw new Error('V7 failed: URL-only storefront cover filter not installed');
}

fs.writeFileSync(file,s);
console.log('[EGRESS V7] storefront base64 blocked; changes=',changes);
