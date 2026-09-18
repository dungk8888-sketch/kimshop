import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

if (!s.includes('const [savingProduct, setSavingProduct] = useState(false);')) {
  throw new Error('KIMSHOP image-storage-save: saveProduct anchor missing');
}

if (!s.includes('const ensureProductImageStored = async')) {
  s=s.replace(
    '  const [savingProduct, setSavingProduct] = useState(false);',
`  const ensureProductImageStored = async (source: string, productId: string, slot: string) => {
    const value = String(source || '').trim();
    if (!value || !value.startsWith('data:image/')) return value;
    const match = value.match(/^data:(image\\/(?:png|jpeg|jpg|webp|gif|avif));base64,/i);
    if (!match) throw new Error('Ảnh local không đúng định dạng');
    const mime = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
    const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];
    const response = await fetch(value);
    const blob = await response.blob();
    if (!blob.size) throw new Error('Ảnh local rỗng');
    const safeProductId = String(productId || 'new').replace(/[^a-zA-Z0-9_-]/g, '');
    const path = \`manual/\${safeProductId}/\${Date.now()}-\${slot}-\${Math.random().toString(36).slice(2,8)}.\${ext}\`;
    const { error: uploadErr } = await supabase.storage.from('product-images').upload(path, blob, {
      contentType: mime,
      cacheControl: '31536000',
      upsert: false,
    });
    if (uploadErr) throw uploadErr;
    const { data } = supabase.storage.from('product-images').getPublicUrl(path);
    if (!data?.publicUrl) throw new Error('Không lấy được URL ảnh sau upload');
    return data.publicUrl;
  };

  const [savingProduct, setSavingProduct] = useState(false);`
  );
}

s=s.replace(
  "    const imageList = Array.from(new Set((Array.isArray(editingProduct.images) ? editingProduct.images : []).filter(Boolean))).slice(0, MAX_PRODUCT_IMAGES);",
  "    let imageList = Array.from(new Set((Array.isArray(editingProduct.images) ? editingProduct.images : []).filter(Boolean))).slice(0, MAX_PRODUCT_IMAGES);"
);

const uploadAnchor="    if (!currentUser?.id) { showToast('Vui lòng đăng nhập lại'); return; }";
if (!s.includes(uploadAnchor)) throw new Error('KIMSHOP image-storage-save: currentUser anchor missing');
if (!s.includes('imageList = await Promise.all(imageList.map')) {
  s=s.replace(uploadAnchor, uploadAnchor + `
    try {
      const uploadProductId = String(editingProduct.id || ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now()));
      imageList = await Promise.all(imageList.map((url: string, idx: number) => ensureProductImageStored(url, uploadProductId, 'gallery-' + idx)));
      if (editingProduct.image && String(editingProduct.image).startsWith('data:image/')) {
        editingProduct.image = imageList[0] || '';
      }
      if (Array.isArray(editingProduct.variantCombos) && editingProduct.variantCombos.length) {
        editingProduct.variantCombos = await Promise.all(editingProduct.variantCombos.map(async (combo: any, idx: number) => ({
          ...combo,
          image: combo?.image ? await ensureProductImageStored(combo.image, uploadProductId, 'variant-' + idx) : combo?.image,
        })));
      }
    } catch (uploadErr: any) {
      console.error('Upload ảnh sản phẩm thất bại', uploadErr);
      showToast('Upload ảnh thất bại: ' + (uploadErr?.message || 'vui lòng thử lại'));
      return;
    }`);
}

writeFileSync(path,s);
console.log('KIMSHOP image-storage-save applied');
