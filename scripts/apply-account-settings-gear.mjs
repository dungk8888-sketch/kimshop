import { readFileSync, writeFileSync } from 'node:fs';
const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let changed=0;
// The account-settings floating control can contain the label in nested JSX, so remove every visible occurrence.
s=s.replace(/Cài\s*[Đđ]ặt\s*Tài\s*Khoản|Cài\s*đặt\s*tài\s*khoản/gi,()=>{changed++;return '';});
// Compact the button that opens the settings screen/modal. Match around Settings icon rather than relying on the label.
s=s.replace(/className="([^"]*(?:fixed|absolute)[^"]*(?:bottom-[^\s"]+)[^"]*(?:right-[^\s"]+)[^"]*)"([^>]*onClick=\{[^}]*\}[^>]*)>([\s\S]{0,500}?<Settings[^>]*>[\s\S]{0,500}?)<\/button>/g,(m,cls,attrs,body)=>{
  changed++;
  const cleaned=cls.replace(/\b(?:px|py|p|gap|rounded)-(?:\[[^\]]+\]|\d+(?:\.5)?|full)\b/g,'').replace(/\s+/g,' ').trim();
  return `<button className="${cleaned} w-11 h-11 p-0 rounded-full flex items-center justify-center" ${attrs} aria-label="Cài đặt tài khoản" title="Cài đặt tài khoản">${body.replace(/>([^<>]*Cài[^<>]*tài[^<>]*khoản[^<>]*)</gi,'><')}</button>`;
});
if(!changed) throw new Error('account settings control not found');
writeFileSync(path,s);
console.log('[KIMSHOP FIX] force gear-only account settings control changes:',changed);
