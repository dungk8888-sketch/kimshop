import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const old=`      setProducts(prev => {
        const byId = new Map(prev.map((p:any)=>[p.id,p]));
        rich.forEach((p:any)=>byId.set(p.id,p));
        return Array.from(byId.values());
      });`;

if(!s.includes(old)) throw new Error('KIMSHOP auth-image-preserve: support merge anchor missing');

const neu=`      setProducts(prev => {
        const byId = new Map(prev.map((p:any)=>[p.id,p]));
        rich.forEach((p:any)=>{
          const existing:any = byId.get(p.id);
          if (existing) {
            const merged:any = { ...existing, ...p };
            if (!p?.image && existing?.image) merged.image = existing.image;
            if ((!Array.isArray(p?.images) || !p.images.length) && Array.isArray(existing?.images) && existing.images.length) {
              merged.images = existing.images;
            }
            byId.set(p.id, merged);
          } else {
            byId.set(p.id,p);
          }
        });
        return Array.from(byId.values());
      });`;

s=s.replace(old,neu);
writeFileSync(path,s);
console.log('[KIMSHOP AUTH IMAGE FIX] support hydration now preserves existing image/images');
