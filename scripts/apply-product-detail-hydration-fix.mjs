import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

const stateMarker = "  // Chi tiết sản phẩm\n  const [selectedProductId, setSelectedProductId] = useState(null);";
const stateReplacement = "  // Chi tiết sản phẩm\n  const [selectedProductId, setSelectedProductId] = useState(null);\n  const [productDetailLoading, setProductDetailLoading] = useState(false);\n  const detailRequestIdRef = useRef(0);";
if (!s.includes(stateMarker)) throw new Error('detail state marker not found');
s = s.replace(stateMarker, stateReplacement);

const loaderMarker = "// Ghép rawProducts (từ bước 1) + imgs/vars/reviews (từ bước 2, mặc định rỗng";
const strictLoader = `// Chi tiết sản phẩm: tải riêng đúng 1 sản phẩm và retry độc lập từng quan hệ.\n// Không dùng dữ liệu nền chưa hoàn tất của card trang chủ làm nguồn duy nhất.\nconst detailQueryRetry = async (factory: any, label: string, attempts = 3) => {\n  let last: any = null;\n  for (let i = 0; i < attempts; i++) {\n    const res = await factory();\n    if (!res?.error) return res;\n    last = res;\n    console.warn(\`Chi tiết SP: \\${label} lỗi lần \\${i + 1}/\\${attempts}\`, res.error);\n    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 250 * (i + 1)));\n  }\n  return last;\n};\n\nconst loadProductDetailRelations = async (productId: string) => {\n  const [imgs, vars, reviews] = await Promise.all([\n    detailQueryRetry(() => supabase.from('product_images').select('*').eq('product_id', productId), 'ảnh phụ'),\n    detailQueryRetry(() => supabase.from('product_variants').select('*').eq('product_id', productId), 'phân loại'),\n    detailQueryRetry(() => supabase.from('product_reviews').select('*').eq('product_id', productId).order('created_at',{ascending:false}), 'đánh giá'),\n  ]);\n  if (imgs?.error || vars?.error || reviews?.error) throw (vars?.error || reviews?.error || imgs?.error);\n  const rawReviews = (reviews?.data || []) as any[];\n  const buyerIds = Array.from(new Set(rawReviews.map((r:any)=>r.buyer_id).filter(Boolean)));\n  let profileById: Record<string, any> = {};\n  if (buyerIds.length) {\n    const p = await detailQueryRetry(() => supabase.from('profiles').select('id,username,full_name').in('id', buyerIds), 'tên khách đánh giá', 2);\n    if (!p?.error) profileById = Object.fromEntries((p.data || []).map((x:any)=>[x.id,x]));\n  }\n  return {\n    imgs: (imgs?.data || []) as any[],\n    vars: (vars?.data || []) as any[],\n    reviews: rawReviews.map((r:any)=>{\n      const profile = profileById[r.buyer_id];\n      return { ...r, reviewer_name: profile?.full_name || profile?.username || r.reviewer_name || 'Khách hàng KimShop' };\n    }),\n  };\n};\n\n`;
if (!s.includes(loaderMarker)) throw new Error('detail loader insertion marker not found');
s = s.replace(loaderMarker, strictLoader + loaderMarker);

const openStart = "  const openProduct = (product) => {";
const openEnd = "  const selectedProduct = products.find((p) => p.id === selectedProductId) || null;";
const startIndex = s.indexOf(openStart);
const endIndex = s.indexOf(openEnd, startIndex);
if (startIndex < 0 || endIndex < 0) throw new Error('openProduct block not found');
const oldOpenBlock = s.slice(startIndex, endIndex);
const newOpenBlock = `  const openProduct = async (product) => {\n    const requestId = ++detailRequestIdRef.current;\n    setSelectedProductId(product.id);\n    setSelectedAttrs({});\n    setSelectedQty(1);\n    setQtyDraft(null);\n    setVariantQtyMap({});\n    setVariantQtyDraftMap({});\n    setGalleryIndex(0);\n    setLightboxOpen(false);\n    setBuyerPage('product');\n    window.scrollTo?.({ top: 0 });\n    setProductDetailLoading(true);\n    setViewedProducts((prev) => [product.id, ...prev.filter((id) => id !== product.id)].slice(0, 20));\n    if (currentUser) touchViewedProductDb(currentUser.id, product.id);\n\n    try {\n      const meta = storefrontMetaRef.current || { shops, categories };\n      const rawRes = await detailQueryRetry(\n        () => supabase.from('products').select('*').eq('id', product.id).single(),\n        'sản phẩm',\n      );\n      if (rawRes?.error || !rawRes?.data) throw (rawRes?.error || new Error('Không tìm thấy sản phẩm'));\n      const rel = await loadProductDetailRelations(product.id);\n      if (detailRequestIdRef.current !== requestId) return;\n      const rich = buildProducts([rawRes.data], meta.shops || shops, meta.categories || categories, rel.imgs, rel.vars, rel.reviews)[0];\n      if (rich) {\n        setProducts((prev) => prev.some((p:any)=>p.id===rich.id)\n          ? prev.map((p:any)=>p.id===rich.id ? rich : p)\n          : [rich, ...prev]);\n      }\n    } catch (e) {\n      console.error('Không tải đủ dữ liệu chi tiết sản phẩm', e);\n      if (detailRequestIdRef.current === requestId) showToast('Không tải đủ dữ liệu sản phẩm. Vui lòng thử lại.');\n    } finally {\n      if (detailRequestIdRef.current === requestId) setProductDetailLoading(false);\n    }\n  };\n\n`;
s = s.slice(0, startIndex) + newOpenBlock + s.slice(endIndex);

const detailUiMarker = "          {/* CHI TIẾT SẢN PHẨM */}\n";
const loadingUi = `          {/* CHI TIẾT SẢN PHẨM */}\n          {buyerPage === 'product' && productDetailLoading && (\n            <main className=\"max-w-6xl mx-auto px-4 py-10 flex-1 w-full\">\n              <div className=\"bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-500\">\n                <div className=\"w-8 h-8 mx-auto mb-3 border-2 border-[#EE4D2D] border-t-transparent rounded-full animate-spin\" />\n                <div className=\"text-sm font-semibold\">Đang tải đầy đủ thông tin sản phẩm...</div>\n                <div className=\"text-[11px] text-gray-400 mt-1\">Ảnh, phân loại và đánh giá đang được đồng bộ.</div>\n              </div>\n            </main>\n          )}\n`;
if (!s.includes(detailUiMarker)) throw new Error('detail UI marker not found');
s = s.replace(detailUiMarker, loadingUi);

s = s.replace("buyerPage === 'product' && selectedProduct && !isShopActive(selectedProduct.shopId)", "buyerPage === 'product' && !productDetailLoading && selectedProduct && !isShopActive(selectedProduct.shopId)");
s = s.replace("buyerPage === 'product' && selectedProduct && isShopActive(selectedProduct.shopId)", "buyerPage === 'product' && !productDetailLoading && selectedProduct && isShopActive(selectedProduct.shopId)");

writeFileSync(path, s);
console.log('[KIMSHOP FIX] product detail strict hydration + retry applied');
