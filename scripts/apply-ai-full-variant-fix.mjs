import { readFileSync, writeFileSync } from 'node:fs';
const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let changes=0;

s=s.replace(/(currentCategoryId=\{editingProduct\.categoryId \|\| ''\}\s*\n)(\s*)onApply=\{applyAIDraft\}/,(_m,a,indent)=>{changes++;return `${a}${indent}currentVariantGroups={editingProduct.variantGroups || []}\n${indent}currentVariantCombos={editingProduct.variantCombos || []}\n${indent}onApply={applyAIDraft}`;});

s=s.replace(/const newGroups = draft\.variantGroups\.length[\s\S]*?: prev\.variantGroups \|\| \[\];/,()=>{changes++;return `const existingGroups = Array.isArray(prev.variantGroups) ? prev.variantGroups : [];
        const aiGroups = Array.isArray(draft.variantGroups) ? draft.variantGroups : [];
        const mergedGroupMap = new Map<string, any>();
        existingGroups.forEach((g:any) => {
          const key=String(g.name||'').trim().toLowerCase();
          if(key) mergedGroupMap.set(key,{ ...g, values:Array.from(new Set((g.values||[]).filter(Boolean))) });
        });
        aiGroups.forEach((g:any, i:number) => {
          const name=String(g.name||'').trim(); const key=name.toLowerCase(); if(!key) return;
          const old=mergedGroupMap.get(key);
          mergedGroupMap.set(key,{ id:old?.id || \`ai_g\${i}_\${name}\`, name:old?.name || name, values:Array.from(new Set([...(old?.values||[]),...(g.values||[])].filter(Boolean))) });
        });
        const newGroups = Array.from(mergedGroupMap.values());`;});

s=s.replace(/const regenCombos = regenerateVariantCombos\(newGroups, prev\.variantCombos \|\| \[\]\);\s*const variantCombos = draft\.skuSuggestion[\s\S]*?: regenCombos;/,()=>{changes++;return `const regenCombos = regenerateVariantCombos(newGroups, prev.variantCombos || []);
        const normalizeAttr = (x:any) => String(x ?? '').trim().toLowerCase();
        const aiDetails = Array.isArray((draft as any).variantDetails) ? (draft as any).variantDetails : [];
        const detailFor = (combo:any) => aiDetails.find((d:any) => {
          const attrs = d?.attributes && typeof d.attributes === 'object' ? d.attributes : {};
          const comboAttrs = combo?.attributes && typeof combo.attributes === 'object' ? combo.attributes : {};
          return newGroups.every((g:any) => normalizeAttr(attrs[g.name]) === normalizeAttr(comboAttrs[g.name]));
        });
        let variantCombos = regenCombos.map((c:any, i:number) => {
          const d:any = detailFor(c); const next:any = { ...c };
          if (d?.price !== '' && d?.price != null && Number(d.price) >= 0) next.price = String(d.price);
          if (d?.originalPrice !== '' && d?.originalPrice != null && Number(d.originalPrice) >= 0) next.originalPrice = String(d.originalPrice);
          if (d?.stock !== '' && d?.stock != null && Number(d.stock) >= 0) next.stock = String(Math.floor(Number(d.stock)));
          if (d?.sku) next.sku = String(d.sku);
          if (!next.sku && draft.skuSuggestion) next.sku = regenCombos.length > 1 ? \`\${draft.skuSuggestion}-\${i + 1}\` : draft.skuSuggestion;
          return next;
        });`;});

s=s.replace("showToast('AI đã điền thông tin sản phẩm — kiểm tra giá/kho rồi lưu');","showToast('AI đã giữ đủ phân loại, giá và kho hiện có — kiểm tra rồi lưu');");
if(changes<3) throw new Error(`AI full variant patch incomplete: ${changes}/3`);
writeFileSync(path,s);
console.log('[KIMSHOP FIX] AI merges groups and preserves variant price/stock:',changes);
