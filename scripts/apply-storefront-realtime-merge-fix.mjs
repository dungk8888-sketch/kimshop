import { readFileSync, writeFileSync } from 'node:fs';

// [KIMSHOP CACHE FIX] `refreshCatalog` (đăng ký ở patches/scale-storefront-1.diff,
// chạy mỗi khi có sự kiện realtime trên products/shops/categories/product_reviews)
// gọi loadStorefrontPage({offset:0,...}). Từ khi apply-home-product-reveal.mjs đổi
// batch size ở offset=0 xuống còn 4 (chỉ để vẽ 4 sản phẩm đầu thật nhanh lúc mount),
// refreshCatalog vô tình cũng chỉ nhận 4 dòng — và vì nó REPLACE thẳng `products`
// (không merge, không đụng tới storefront cache), bất kỳ realtime nào bắn ra
// (sold/stock đổi do có đơn mới, seller sửa sản phẩm, review mới...) đều sập toàn
// bộ danh sách đã tải/đã "xem thêm" của người mua xuống chỉ còn 4 sản phẩm.
//
// Fix: refreshCatalog vẫn coi trang đầu (24 sp) là nguồn "mới nhất" để cập nhật giá/
// tồn kho/rating, nhưng UPSERT vào danh sách hiện có theo id thay vì thay thế, và
// ghi lại cache thống nhất (writeStorefrontCache) như mọi writer khác của storefront.

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

const old = `  const refreshCatalog=async()=>{\n    try{\n      const [{shops,categories},page]=await Promise.all([loadCatalogMeta(),loadStorefrontPage({offset:0,categoryId:selectedCategory,search:searchQuery,sortBy})]);\n      storefrontMetaRef.current={shops,categories}; setShops(shops); setCategories(categories); setStorefrontTotal(page.total); setStorefrontHasMore(page.rawProducts.length<page.total);\n      const next=buildProducts(page.rawProducts,shops,categories); setProducts(next);\n    }catch(e){console.error('Không làm mới được catalog',e)}\n  };`;

const replacement = `  const refreshCatalog=async()=>{\n    try{\n      // Realtime refresh is NOT the first-paint path. Always fetch a normal page\n      // (24 rows), then upsert it into everything the buyer already loaded.\n      const [{shops,categories},page]=await Promise.all([\n        loadCatalogMeta(),\n        loadStorefrontPage({offset:0,categoryId:selectedCategory,search:searchQuery,sortBy,limit:STOREFRONT_PAGE_SIZE})\n      ]);\n      storefrontMetaRef.current={shops,categories}; setShops(shops); setCategories(categories); setStorefrontTotal(page.total);\n      const fresh=buildProducts(page.rawProducts,shops,categories);\n      setProducts((prev:any[])=>{\n        const byId=new Map((prev||[]).map((p:any)=>[p.id,p]));\n        fresh.forEach((p:any)=>byId.set(p.id,p));\n        const merged=Array.from(byId.values());\n        writeStorefrontCache(merged);\n        setStorefrontHasMore(merged.length<page.total);\n        return merged;\n      });\n    }catch(e){console.error('Không làm mới được catalog',e)}\n  };`;

if (!s.includes(old)) throw new Error('refreshCatalog anchor not found');
s = s.replace(old, replacement);
writeFileSync(path, s);
console.log('[KIMSHOP FIX] refreshCatalog now merges + caches instead of replacing with 4 rows');
