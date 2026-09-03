import { readFileSync, writeFileSync } from 'node:fs';
const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let changes=0;

s=s.replace(/(currentCategoryId=\{editingProduct\.categoryId \|\| ''\}\s*\n)(\s*)onApply=\{applyAIDraft\}/,(_m,a,indent)=>{changes++;return `${a}${indent}currentVariantGroups={editingProduct.variantGroups || []}\n${indent}currentVariantCombos={editingProduct.variantCombos || []}\n${indent}onApply={applyAIDraft}`;});

s=s.replace(/const newGroups = draft\.variantGroups\.length[\s\S]*?: prev\.variantGroups \|\| \[\];/,()=>{changes++;return `const existingGroups = Array.isArray(prev.variantGroups) ? prev.variantGroups : [];
        const aiGroups = Array.isArray(draft.variantGroups) ? draft.variantGroups : [];
        const normAI = (x:any) => String(x ?? '').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().trim();
        const groupKind = (name:any) => /mau|color/.test(normAI(name)) ? 'color' : /loai|phan loai|type/.test(normAI(name)) ? 'type' : normAI(name);
        const mergedGroupMap = new Map<string, any>();
        existingGroups.forEach((g:any) => { const key=groupKind(g.name); if(key) mergedGroupMap.set(key,{ ...g, values:Array.from(new Set((g.values||[]).filter(Boolean))) }); });
        aiGroups.forEach((g:any, i:number) => { const name=String(g.name||'').trim(); const key=groupKind(name); if(!key) return; const old=mergedGroupMap.get(key); mergedGroupMap.set(key,{ id:old?.id || \`ai_g\${i}_\${name}\`, name:old?.name || name, values:Array.from(new Set([...(old?.values||[]),...(g.values||[])].filter(Boolean))) }); });
        const newGroups = Array.from(mergedGroupMap.values());`;});

s=s.replace(/const regenCombos = regenerateVariantCombos\(newGroups, prev\.variantCombos \|\| \[\]\);\s*const variantCombos = draft\.skuSuggestion[\s\S]*?: regenCombos;/,()=>{changes++;return `const regenCombos = regenerateVariantCombos(newGroups, prev.variantCombos || []);
        const normalizeAttr = (x:any) => String(x ?? '').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().trim();
        const attrKind = (name:any) => /mau|color/.test(normalizeAttr(name)) ? 'color' : /loai|phan loai|type/.test(normalizeAttr(name)) ? 'type' : normalizeAttr(name);
        const aiDetails = Array.isArray((draft as any).variantDetails) ? (draft as any).variantDetails : [];
        const semanticAttrs = (attrs:any) => { const out:any={}; Object.entries(attrs && typeof attrs==='object'?attrs:{}).forEach(([k,v])=>{out[attrKind(k)]=normalizeAttr(v)}); return out; };
        const detailFor = (combo:any) => { const ca=semanticAttrs(combo?.attributes); return aiDetails.find((d:any)=>{ const da=semanticAttrs(d?.attributes); return Object.keys(da).length>0 && Object.entries(da).every(([k,v])=>ca[k]===v); }); };
        let variantCombos = regenCombos.map((c:any, i:number) => {
          const d:any = detailFor(c); const next:any = { ...c };
          if (d?.price !== '' && d?.price != null && Number(d.price) >= 0) next.price = String(d.price);
          if (d?.originalPrice !== '' && d?.originalPrice != null && Number(d.originalPrice) >= 0) next.originalPrice = String(d.originalPrice);
          if (d?.stock !== '' && d?.stock != null && Number(d.stock) >= 0) next.stock = String(Math.floor(Number(d.stock)));
          if (d?.sku) next.sku = String(d.sku);
          if (!next.sku && draft.skuSuggestion) next.sku = regenCombos.length > 1 ? \`\${draft.skuSuggestion}-\${i + 1}\` : draft.skuSuggestion;
          return next;
        });`;});

s=s.replace("showToast('AI đã điền thông tin sản phẩm — kiểm tra giá/kho rồi lưu');","showToast('AI đã điền phân loại và giá theo từng loại — kiểm tra rồi lưu');");
if(changes<3) throw new Error(`AI full variant patch incomplete: ${changes}/3`);
writeFileSync(path,s);
console.log('[KIMSHOP FIX] AI semantic group/detail price matching:',changes);
