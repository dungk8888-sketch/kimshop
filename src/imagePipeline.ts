import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient';

export const DEFAULT_PRODUCT_IMAGE_BUCKET = 'product-images';
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export interface ImagePipelineOptions { bucket?: string; pathPrefix?: string; fetchProxyUrl?: string; anonKey?: string; }
export type ImagePipelineErrorCode = 'EMPTY_URL'|'INVALID_URL'|'UNSUPPORTED_DRIVE_LINK'|'DRIVE_FOLDER_LIST_FAILED'|'FETCH_FAILED'|'NOT_AN_IMAGE'|'TOO_LARGE'|'UPLOAD_FAILED';
export interface ImagePipelineError { code: ImagePipelineErrorCode; message: string; }
export interface ImagePipelineSuccess { ok:true; sourceUrl:string; url:string; path:string; bucket:string; }
export interface ImagePipelineFailure { ok:false; sourceUrl:string; error:ImagePipelineError; }
export type ImagePipelineResult = ImagePipelineSuccess | ImagePipelineFailure;
export interface GoogleDriveLinkInfo { isGoogleDrive:boolean; unsupported?:boolean; fileId?:string; folderId?:string; }

export function parseGoogleDriveLink(rawUrl:string):GoogleDriveLinkInfo {
  let u:URL; try { u=new URL(rawUrl); } catch { return {isGoogleDrive:false}; }
  const host=u.hostname.replace(/^www\./,'');
  if (host!=='drive.google.com' && host!=='docs.google.com') return {isGoogleDrive:false};
  const folder=u.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/); if(folder) return {isGoogleDrive:true,folderId:folder[1]};
  const file=u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/); if(file) return {isGoogleDrive:true,fileId:file[1]};
  const id=u.searchParams.get('id'); if(id) return {isGoogleDrive:true,fileId:id};
  return {isGoogleDrive:true,unsupported:true};
}
export function toGoogleDriveDirectUrl(fileId:string){ return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`; }
export function splitImageUrls(cell:string|null|undefined):string[]{
  const s=String(cell??'').trim(); if(!s)return[];
  return Array.from(new Set(s.split(/[\n,;|]+/).map(x=>x.trim()).filter(Boolean)));
}
function isHttpUrl(raw:string){ try{const u=new URL(raw);return u.protocol==='http:'||u.protocol==='https:';}catch{return false;} }
const EXT_BY_MIME:Record<string,string>={'image/jpeg':'jpg','image/jpg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif','image/heic':'heic','image/heif':'heif'};
function guessExtension(ct:string|null,url:string){ const mime=(ct||'').split(';')[0].trim().toLowerCase(); if(EXT_BY_MIME[mime])return EXT_BY_MIME[mime]; return url.match(/\.([a-zA-Z0-9]{2,5})(?:[?#]|$)/)?.[1]?.toLowerCase()||'jpg'; }
function randomId(){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);}

// IMPORTANT: use the exact config that created the working KimShop Supabase client.
// This avoids relying on import.meta.env a second time inside the bulk module.
function resolveFetchProxyUrl(options?:ImagePipelineOptions){
  if(options?.fetchProxyUrl)return options.fetchProxyUrl;
  if(!SUPABASE_URL)throw new Error('Không xác định được URL Edge Function fetch-remote-image.');
  return `${SUPABASE_URL.replace(/\/$/,'')}/functions/v1/fetch-remote-image`;
}
function resolveAnonKey(options?:ImagePipelineOptions){return options?.anonKey||SUPABASE_ANON_KEY;}

interface FetchedImage { blob:Blob; contentType:string|null; }
async function tryFetchDirectly(url:string):Promise<FetchedImage|null>{try{const r=await fetch(url,{mode:'cors'});if(!r.ok)return null;return{blob:await r.blob(),contentType:r.headers.get('content-type')}}catch{return null}}
async function edgeRequest(body:any,options?:ImagePipelineOptions):Promise<Response>{
  const anon=resolveAnonKey(options);
  return fetch(resolveFetchProxyUrl(options),{method:'POST',headers:{'Content-Type':'application/json',...(anon?{apikey:anon,Authorization:`Bearer ${anon}`}:{})},body:JSON.stringify(body)});
}
async function fetchViaEdgeFunction(url:string,options?:ImagePipelineOptions):Promise<FetchedImage>{
  const r=await edgeRequest({url},options); if(!r.ok){let d='';try{d=(await r.json())?.error||''}catch{} throw new Error(d||`Edge Function trả lỗi HTTP ${r.status}`)}
  return{blob:await r.blob(),contentType:r.headers.get('content-type')};
}
async function listGoogleDriveFolderImages(folderUrl:string,options?:ImagePipelineOptions):Promise<string[]>{
  const r=await edgeRequest({url:folderUrl,mode:'list-folder'},options); if(!r.ok){let d='';try{d=(await r.json())?.error||''}catch{} throw new Error(d||`Không đọc được thư mục Drive (HTTP ${r.status})`)}
  const j=await r.json(); const urls=Array.isArray(j?.urls)?j.urls.filter((x:unknown)=>typeof x==='string'&&x):[]; if(!urls.length)throw new Error('Không tìm thấy ảnh công khai nào trong thư mục Drive này.'); return urls;
}

export async function processImageUrl(supabase:SupabaseClient,sourceUrl:string,options?:ImagePipelineOptions):Promise<ImagePipelineResult>{
  const bucket=options?.bucket||DEFAULT_PRODUCT_IMAGE_BUCKET, trimmed=String(sourceUrl??'').trim();
  if(!trimmed)return{ok:false,sourceUrl:trimmed,error:{code:'EMPTY_URL',message:'URL ảnh rỗng.'}};
  if(!isHttpUrl(trimmed))return{ok:false,sourceUrl:trimmed,error:{code:'INVALID_URL',message:`URL không hợp lệ: "${trimmed}"`}};
  const drive=parseGoogleDriveLink(trimmed);
  if(drive.isGoogleDrive&&drive.folderId)return{ok:false,sourceUrl:trimmed,error:{code:'UNSUPPORTED_DRIVE_LINK',message:'Đây là link thư mục Google Drive. Hệ thống sẽ tự xử lý khi đăng hàng loạt.'}};
  if(drive.isGoogleDrive&&drive.unsupported)return{ok:false,sourceUrl:trimmed,error:{code:'UNSUPPORTED_DRIVE_LINK',message:'Không nhận ra định dạng link Google Drive này.'}};
  const url=drive.isGoogleDrive&&drive.fileId?toGoogleDriveDirectUrl(drive.fileId):trimmed;
  let fetched:FetchedImage|null=null;
  try{if(drive.isGoogleDrive)fetched=await fetchViaEdgeFunction(url,options);else{fetched=await tryFetchDirectly(url);if(!fetched)fetched=await fetchViaEdgeFunction(url,options)}}catch(e:any){return{ok:false,sourceUrl:trimmed,error:{code:'FETCH_FAILED',message:`Không tải được ảnh: ${e?.message||'lỗi không xác định'}`}}}
  if(!fetched)return{ok:false,sourceUrl:trimmed,error:{code:'FETCH_FAILED',message:'Không tải được ảnh.'}};
  const {blob,contentType}=fetched;
  if(contentType&&!contentType.toLowerCase().startsWith('image/'))return{ok:false,sourceUrl:trimmed,error:{code:'NOT_AN_IMAGE',message:`Nội dung tải về không phải ảnh (content-type: ${contentType}).`}};
  if(blob.size>MAX_IMAGE_BYTES)return{ok:false,sourceUrl:trimmed,error:{code:'TOO_LARGE',message:`Ảnh quá lớn (${(blob.size/1024/1024).toFixed(1)}MB).`}};
  const path=`${options?.pathPrefix||''}${randomId()}.${guessExtension(contentType,trimmed)}`;
  const {error}=await supabase.storage.from(bucket).upload(path,blob,{contentType:contentType||undefined,upsert:false});
  if(error)return{ok:false,sourceUrl:trimmed,error:{code:'UPLOAD_FAILED',message:`Lỗi upload Supabase Storage: ${error.message}`}};
  const {data}=supabase.storage.from(bucket).getPublicUrl(path); return{ok:true,sourceUrl:trimmed,url:data.publicUrl,path,bucket};
}

export async function processImageUrls(supabase:SupabaseClient,sourceUrls:string[],options?:ImagePipelineOptions):Promise<ImagePipelineResult[]>{
  const expanded:string[]=[], early:ImagePipelineFailure[]=[];
  for(const raw of sourceUrls){const d=parseGoogleDriveLink(raw);if(d.isGoogleDrive&&d.folderId){try{expanded.push(...await listGoogleDriveFolderImages(raw,options))}catch(e:any){early.push({ok:false,sourceUrl:raw,error:{code:'DRIVE_FOLDER_LIST_FAILED',message:`Không lấy được ảnh trong thư mục Drive: ${e?.message||'lỗi không xác định'}`}})}}else expanded.push(raw)}
  const unique=Array.from(new Set(expanded)); const settled=await Promise.allSettled(unique.map(u=>processImageUrl(supabase,u,options)));
  return [...settled.map((s,i)=>s.status==='fulfilled'?s.value:({ok:false,sourceUrl:unique[i],error:{code:'FETCH_FAILED',message:s.reason?.message||'Lỗi không xác định.'}} as ImagePipelineFailure)),...early];
}
