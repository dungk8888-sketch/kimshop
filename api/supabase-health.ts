export default async function handler(req:any,res:any){
  const base=(process.env.VITE_SUPABASE_URL||'https://ygqqtudavuugrvpkhvdp.supabase.co').replace(/\/$/,'');
  const key=process.env.VITE_SUPABASE_ANON_KEY||'';
  const started=Date.now();
  try{
    const r=await fetch(base+'/auth/v1/health',{headers:key?{apikey:key}:{},signal:AbortSignal.timeout(8000)});
    const text=await r.text();
    res.status(200).json({ok:r.ok,status:r.status,ms:Date.now()-started,hasKey:Boolean(key),body:text.slice(0,300)});
  }catch(e:any){
    res.status(200).json({ok:false,ms:Date.now()-started,hasKey:Boolean(key),error:String(e?.message||e)});
  }
}
