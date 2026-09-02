import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const files = readdirSync('source_parts').filter((name) => /^App\.gz\.b64\.part\d+\.txt$/.test(name)).sort();
if (files.length !== 8) throw new Error(`Expected 8 compressed App source parts, found ${files.length}`);
const b64 = files.map((name) => readFileSync(`source_parts/${name}`, 'utf8').trim()).join('');
let source = gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');

const richVariantMapping = "variants: variants.sort((a,b)=>a.sort_order-b.sort_order).map(v=>({id:v.id,name:v.name,price:Number(v.price ?? p.price),stock:v.stock}))";
const stringVariantMapping = "variants: variants.sort((a,b)=>a.sort_order-b.sort_order).map(v=>v.name).filter(Boolean)";
if (source.includes(richVariantMapping)) source = source.replace(richVariantMapping, stringVariantMapping);

// State + navigation
source = source.replace("const [selectedQty, setSelectedQty] = useState(1);", "const [selectedQty, setSelectedQty] = useState(1);\n  const [activeProductImage, setActiveProductImage] = useState('');\n  const [lightboxImage, setLightboxImage] = useState('');");
source = source.replace("setSelectedQty(1);\n    setBuyerPage('product');", "setSelectedQty(1);\n    setActiveProductImage((product.images && product.images[0]) || product.image || '');\n    setBuyerPage('product');");

// Seller editor data model
source = source.replace(/setEditingProduct\(\{ id: null, name: '', category: 'Phụ Kiện Điện Thoại', price: '', originalPrice: '', stock: '', image: '', variants: '', description: '' \}\);/, "setEditingProduct({ id: null, name: '', category: 'Phụ Kiện Điện Thoại', price: '', originalPrice: '', stock: '', image: '', images: [], variants: '', description: '' });");
source = source.replace("setEditingProduct({ ...p, variants: p.variants.join(', ') });", "setEditingProduct({ ...p, images: (p.images?.length ? p.images : (p.image ? [p.image] : [])), variants: p.variants.join(', ') });");

// Multiple file picker handler
source = source.replace(/const handleImageFile = \(e\) => \{[\s\S]*?\n  \};\n  const saveProduct = \(\) => \{/, `const handleImageFile = (e) => {
    const files:any[] = Array.from(e.target.files || []);
    if (!files.length) return;
    if (files.some((f:any)=>f.size > 2*1024*1024)) { showToast('Mỗi ảnh tối đa 2MB'); e.target.value=''; return; }
    const current = editingProduct?.images || (editingProduct?.image ? [editingProduct.image] : []);
    const picked = files.slice(0, Math.max(0, 9-current.length));
    if (!picked.length) { showToast('Mỗi sản phẩm tối đa 9 ảnh'); e.target.value=''; return; }
    Promise.all(picked.map((file:any)=>new Promise((resolve)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.readAsDataURL(file); }))).then((added:any[])=>{
      setEditingProduct((prev:any)=>{ const images=[...(prev.images || (prev.image?[prev.image]:[])),...added].slice(0,9); return {...prev,images,image:images[0]||''}; });
    });
    e.target.value='';
  };
  const saveProduct = () => {`);

// Keep cover + gallery together when saving locally (existing catalog sync persists them).
source = source.replace(/stock: Number\(editingProduct\.stock\) \|\| 0, image: editingProduct\.image \|\| p\.image,/, "stock: Number(editingProduct.stock) || 0, image: editingProduct.images?.[0] || editingProduct.image || p.image, images: editingProduct.images?.length ? editingProduct.images : (editingProduct.image ? [editingProduct.image] : (p.images || [p.image])),");
source = source.replace(/image: editingProduct\.image \|\| 'https:\/\/images\.unsplash\.com\/photo-1526406915894-7bcd65f60845\?w=600&q=80',/, "image: editingProduct.images?.[0] || editingProduct.image || 'https://images.unsplash.com/photo-1526406915894-7bcd65f60845?w=600&q=80', images: editingProduct.images?.length ? editingProduct.images : (editingProduct.image ? [editingProduct.image] : []),");

// Upgrade the existing file input to multi-select.
source = source.replace(/<input ref=\{fileInputRef\} type="file" accept="image\/png,image\/jpeg" onChange=\{handleImageFile\} className="hidden" \/>/g, '<input ref={fileInputRef} type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={handleImageFile} className="hidden" />');

// Insert an ordered thumbnail manager immediately before the existing image upload row.
const editorMarker = '<div className="flex items-start gap-3">';
const editorPos = source.indexOf(editorMarker, source.indexOf('Hình ảnh sản phẩm'));
if (editorPos !== -1) {
  const galleryEditor = `<div className="mb-3 flex flex-wrap gap-2">{(editingProduct.images || (editingProduct.image ? [editingProduct.image] : [])).map((img,idx)=><div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border-2 border-gray-100"><img src={img} className="w-full h-full object-cover" />{idx===0&&<span className="absolute bottom-0 inset-x-0 bg-[#EE4D2D] text-white text-[8px] text-center">Đại diện</span>}<button type="button" onClick={()=>setEditingProduct((prev:any)=>{const images=(prev.images || [prev.image]).filter((_,i)=>i!==idx);return {...prev,images,image:images[0]||''}})} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5"><X size={9}/></button>{idx>0&&<button type="button" onClick={()=>setEditingProduct((prev:any)=>{const images=[...(prev.images || [prev.image])];[images[idx-1],images[idx]]=[images[idx],images[idx-1]];return {...prev,images,image:images[0]}})} className="absolute top-1 left-1 bg-white/90 rounded px-1 text-[9px]">←</button>}</div>)}{(editingProduct.images || (editingProduct.image?[editingProduct.image]:[])).length<9&&<button type="button" onClick={()=>fileInputRef.current?.click()} className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400"><ImagePlus size={18}/><span className="text-[9px]">Thêm ảnh</span></button>}</div>\n                      `;
  source = source.slice(0,editorPos) + galleryEditor + source.slice(editorPos);
  console.log('Injected multi-image seller editor');
} else console.warn('Seller image section not found');

// Product detail: replace the first main selectedProduct image with gallery + lightbox trigger.
const mainImgRe = /<img ref=\{productImgRef\} src=\{selectedProduct\.image\} alt=\{selectedProduct\.name\} className="([^"]+)" \/>/;
if (mainImgRe.test(source)) {
  source = source.replace(mainImgRe, `<button type="button" onClick={()=>setLightboxImage(activeProductImage || selectedProduct.image)} className="block w-full"><img ref={productImgRef} src={activeProductImage || selectedProduct.image} alt={selectedProduct.name} className="$1" /></button>{(selectedProduct.images?.length || 0)>1&&<div className="flex gap-2 overflow-x-auto mt-2 pb-1">{selectedProduct.images.map((img,idx)=><button type="button" key={idx} onClick={()=>setActiveProductImage(img)} className={\`w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden border-2 \${(activeProductImage || selectedProduct.image)===img?'border-[#EE4D2D]':'border-gray-100'}\`}><img src={img} className="w-full h-full object-cover" /></button>)}</div>}`);
  console.log('Injected product image gallery');
} else console.warn('Main product image not found');

// Full-screen image preview
const confirmMarker = '      {/* HỘP THOẠI XÁC NHẬN */}';
if (source.includes(confirmMarker)) source = source.replace(confirmMarker, `{lightboxImage && <div onClick={()=>setLightboxImage('')} className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"><button onClick={()=>setLightboxImage('')} className="absolute top-5 right-5 text-white bg-white/10 rounded-full p-2"><X size={24}/></button><img onClick={(e)=>e.stopPropagation()} src={lightboxImage} className="max-w-full max-h-[90vh] object-contain rounded-lg" /></div>}\n\n${confirmMarker}`);

writeFileSync('src/App.tsx', source);
console.log(`Assembled src/App.tsx from ${files.length} compressed source parts (${source.length} chars).`);
