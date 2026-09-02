import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const files = readdirSync('source_parts')
  .filter((name) => /^App\.gz\.b64\.part\d+\.txt$/.test(name))
  .sort();

if (files.length !== 8) throw new Error(`Expected 8 compressed App source parts, found ${files.length}`);
const b64 = files.map((name) => readFileSync(`source_parts/${name}`, 'utf8').trim()).join('');
let source = gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');

// Production hotfix: DB variants are rich objects, but the current product-detail/cart UI
// expects variant names (strings). Rendering the objects directly crashes React when a
// user opens a product. Normalize them during build until App.tsx is refactored end-to-end.
const richVariantMapping = "variants: variants.sort((a,b)=>a.sort_order-b.sort_order).map(v=>({id:v.id,name:v.name,price:Number(v.price ?? p.price),stock:v.stock}))";
const stringVariantMapping = "variants: variants.sort((a,b)=>a.sort_order-b.sort_order).map(v=>v.name).filter(Boolean)";
if (source.includes(richVariantMapping)) {
  source = source.replace(richVariantMapping, stringVariantMapping);
  console.log('Applied product variant normalization hotfix.');
}

// Multi-image product gallery. Keep `image` as the cover for backwards compatibility,
// while `images[]` stores the ordered gallery used by product detail and seller editor.
source = source.replace(
  "const [selectedQty, setSelectedQty] = useState(1);",
  "const [selectedQty, setSelectedQty] = useState(1);\n  const [activeProductImage, setActiveProductImage] = useState('');\n  const [lightboxImage, setLightboxImage] = useState('');"
);
source = source.replace(
  "setSelectedQty(1);\n    setBuyerPage('product');",
  "setSelectedQty(1);\n    setActiveProductImage((product.images && product.images[0]) || product.image || '');\n    setBuyerPage('product');"
);
source = source.replace(
  "setEditingProduct({ id: null, name: '', category: 'Phụ Kiện Điện Thoại', price: '', originalPrice: '', stock: '', image: '', variants: '', description: '' });",
  "setEditingProduct({ id: null, name: '', category: 'Phụ Kiện Điện Thoại', price: '', originalPrice: '', stock: '', image: '', images: [], variants: '', description: '' });"
);
source = source.replace(
  "setEditingProduct({ ...p, variants: p.variants.join(', ') });",
  "setEditingProduct({ ...p, images: (p.images && p.images.length ? p.images : (p.image ? [p.image] : [])), variants: p.variants.join(', ') });"
);
source = source.replace(
  "const file = e.target.files?.[0];\n    if (!file) return;\n    if (file.size > 2 * 1024 * 1024) { showToast('Ảnh vượt quá dung lượng tối đa 2MB'); return; }\n    const reader = new FileReader();\n    reader.onload = () => setEditingProduct((prev) => ({ ...prev, image: reader.result }));\n    reader.readAsDataURL(file);",
  "const files = Array.from(e.target.files || []);\n    if (!files.length) return;\n    if (files.some((file:any) => file.size > 2 * 1024 * 1024)) { showToast('Mỗi ảnh tối đa 2MB'); e.target.value=''; return; }\n    const remaining = Math.max(0, 9 - (editingProduct?.images?.length || 0));\n    const picked:any[] = files.slice(0, remaining);\n    if (!picked.length) { showToast('Mỗi sản phẩm tối đa 9 ảnh'); e.target.value=''; return; }\n    Promise.all(picked.map((file:any) => new Promise((resolve) => { const reader = new FileReader(); reader.onload=()=>resolve(reader.result); reader.readAsDataURL(file); }))).then((newImages:any[]) => {\n      setEditingProduct((prev:any) => { const images=[...(prev.images || (prev.image ? [prev.image] : [])), ...newImages].slice(0,9); return {...prev, images, image: images[0] || ''}; });\n      if (files.length > picked.length) showToast('Đã lấy tối đa 9 ảnh');\n    });\n    e.target.value='';"
);
source = source.replace(
  "stock: Number(editingProduct.stock) || 0, image: editingProduct.image || p.image,\n        variants:",
  "stock: Number(editingProduct.stock) || 0, image: (editingProduct.images?.[0] || editingProduct.image || p.image), images: (editingProduct.images?.length ? editingProduct.images : (editingProduct.image ? [editingProduct.image] : (p.images || [p.image]))),\n        variants:"
);
source = source.replace(
  "image: editingProduct.image || 'https://images.unsplash.com/photo-1526406915894-7bcd65f60845?w=600&q=80',\n        variants:",
  "image: editingProduct.images?.[0] || editingProduct.image || 'https://images.unsplash.com/photo-1526406915894-7bcd65f60845?w=600&q=80', images: (editingProduct.images?.length ? editingProduct.images : (editingProduct.image ? [editingProduct.image] : [])),\n        variants:"
);

const oldImageEditor = `                      <div className="flex items-start gap-3">\n                        <div\n                          onClick={() => fileInputRef.current?.click()}\n                          className="relative w-24 h-24 flex-shrink-0 border-2 border-dashed border-gray-300 rounded-sm flex flex-col items-center justify-center gap-1 text-gray-400 cursor-pointer hover:border-[#EE4D2D] hover:text-[#EE4D2D] overflow-hidden"\n                        >\n                          {editingProduct.image ? (\n                            <>\n                              <img src={editingProduct.image} alt="Xem trước" className="w-full h-full object-cover" />\n                              <button\n                                onClick={(e) => { e.stopPropagation(); setEditingProduct({ ...editingProduct, image: '' }); }}\n                                className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"\n                              >\n                                <X size={10} />\n                              </button>\n                            </>\n                          ) : (\n                            <>\n                              <ImagePlus size={20} />\n                              <span className="text-[9px] text-center leading-tight">Tải ảnh lên</span>\n                            </>\n                          )}\n                        </div>\n                        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" onChange={handleImageFile} className="hidden" />\n                        <div className="flex-1 space-y-1">\n                          <input\n                            placeholder="Hoặc dán Link URL ảnh tại đây..."\n                            value={editingProduct.image && editingProduct.image.startsWith('http') ? editingProduct.image : ''}\n                            onChange={(e) => setEditingProduct({ ...editingProduct, image: e.target.value })}\n                            className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]"\n                          />\n                          <p className="text-gray-400 text-[10px]">Hỗ trợ JPG, PNG. Kích thước đề xuất 800x800. Tối đa 2MB.</p>\n                        </div>\n                      </div>`;
const newImageEditor = `                      <div className="space-y-3">\n                        <div className="flex flex-wrap gap-2">\n                          {(editingProduct.images || (editingProduct.image ? [editingProduct.image] : [])).map((img, idx) => (\n                            <div key={idx} className="relative w-24 h-24 border rounded-lg overflow-hidden group">\n                              <img src={img} alt={\`Ảnh \${idx+1}\`} className="w-full h-full object-cover" />\n                              {idx === 0 && <span className="absolute bottom-0 left-0 right-0 bg-[#EE4D2D] text-white text-[9px] text-center py-0.5">Ảnh đại diện</span>}\n                              <button type="button" onClick={() => setEditingProduct((prev:any) => { const images=(prev.images || [prev.image]).filter((_,i)=>i!==idx); return {...prev,images,image:images[0]||''}; })} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1"><X size={10}/></button>\n                              {idx > 0 && <button type="button" onClick={() => setEditingProduct((prev:any) => { const images=[...(prev.images || [prev.image])]; [images[idx-1],images[idx]]=[images[idx],images[idx-1]]; return {...prev,images,image:images[0]}; })} className="absolute top-1 left-1 bg-white/90 text-gray-700 rounded px-1 text-[10px]">←</button>}\n                            </div>\n                          ))}\n                          {(editingProduct.images || []).length < 9 && <button type="button" onClick={() => fileInputRef.current?.click()} className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-[#EE4D2D] hover:text-[#EE4D2D]"><ImagePlus size={20}/><span className="text-[9px]">Thêm ảnh</span></button>}\n                        </div>\n                        <input ref={fileInputRef} type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={handleImageFile} className="hidden" />\n                        <div className="flex gap-2">\n                          <input placeholder="Dán URL ảnh rồi bấm Thêm" id="product-image-url" className="flex-1 border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]" />\n                          <button type="button" onClick={() => { const el:any=document.getElementById('product-image-url'); const url=el?.value?.trim(); if(!url)return; setEditingProduct((prev:any)=>{ const images=[...(prev.images || (prev.image?[prev.image]:[])),url].slice(0,9); return {...prev,images,image:images[0]};}); el.value=''; }} className="px-4 border border-[#EE4D2D] text-[#EE4D2D] rounded-sm font-medium">Thêm</button>\n                        </div>\n                        <p className="text-gray-400 text-[10px]">Tối đa 9 ảnh · JPG, PNG, WebP · mỗi ảnh tối đa 2MB · ảnh đầu tiên là ảnh đại diện.</p>\n                      </div>`;
if (source.includes(oldImageEditor)) source = source.replace(oldImageEditor, newImageEditor);
else console.warn('Multi-image editor anchor not found');

const oldDetailImage = `<div className="w-full md:w-72 flex-shrink-0">\n                  <img ref={productImgRef} src={selectedProduct.image} alt={selectedProduct.name} className="w-full h-72 object-cover rounded-xl border border-gray-100 shadow-sm" />\n                </div>`;
const newDetailImage = `<div className="w-full md:w-72 flex-shrink-0 space-y-2">\n                  <button type="button" onClick={() => setLightboxImage(activeProductImage || selectedProduct.image)} className="block w-full">\n                    <img ref={productImgRef} src={activeProductImage || selectedProduct.image} alt={selectedProduct.name} className="w-full h-72 object-cover rounded-xl border border-gray-100 shadow-sm" />\n                  </button>\n                  {(selectedProduct.images?.length || 0) > 1 && <div className="flex gap-2 overflow-x-auto pb-1">\n                    {selectedProduct.images.map((img,idx)=><button type="button" key={idx} onClick={()=>setActiveProductImage(img)} className={\`w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden border-2 \${(activeProductImage || selectedProduct.image)===img?'border-[#EE4D2D]':'border-gray-100'}\`}><img src={img} className="w-full h-full object-cover" /></button>)}\n                  </div>}\n                </div>`;
if (source.includes(oldDetailImage)) source = source.replace(oldDetailImage, newDetailImage);
else console.warn('Product detail image anchor not found');

source = source.replace(
  "      {/* HỘP THOẠI XÁC NHẬN */}",
  `      {lightboxImage && <div onClick={()=>setLightboxImage('')} className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"><button onClick={()=>setLightboxImage('')} className="absolute top-5 right-5 text-white bg-white/10 rounded-full p-2"><X size={24}/></button><img onClick={(e)=>e.stopPropagation()} src={lightboxImage} className="max-w-full max-h-[90vh] object-contain rounded-lg" /></div>}\n\n      {/* HỘP THOẠI XÁC NHẬN */}`
);

writeFileSync('src/App.tsx', source);
console.log(`Assembled src/App.tsx from ${files.length} compressed source parts (${source.length} chars).`);
