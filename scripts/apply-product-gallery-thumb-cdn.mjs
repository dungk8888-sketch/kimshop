import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

const mainImgMarker = '            src={active}';
if (!s.includes(mainImgMarker)) throw new Error('ProductGallery main image marker not found');
if (s.split(mainImgMarker).length - 1 !== 1) throw new Error('ProductGallery main image marker not unique');
s = s.replace(mainImgMarker, '            src={productThumb(active, 640)}');

const galleryThumbMarker = '<img src={src} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />';
if (!s.includes(galleryThumbMarker)) throw new Error('ProductGallery thumbnail rail marker not found');
if (s.split(galleryThumbMarker).length - 1 !== 1) throw new Error('ProductGallery thumbnail rail marker not unique');
s = s.replace(galleryThumbMarker, '<img src={productThumb(src, 320)} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />');

const lightboxThumbMarker = '<img src={src} alt="" className="w-full h-full object-cover" draggable={false} />';
if (!s.includes(lightboxThumbMarker)) throw new Error('ImageLightbox thumbnail rail marker not found');
if (s.split(lightboxThumbMarker).length - 1 !== 1) throw new Error('ImageLightbox thumbnail rail marker not unique');
s = s.replace(lightboxThumbMarker, '<img src={productThumb(src, 320)} alt="" className="w-full h-full object-cover" draggable={false} />');

writeFileSync(path, s);
console.log('[KIMSHOP PERF] productThumb applied to ProductGallery main+rail and ImageLightbox rail (lightbox main image left full-res)');