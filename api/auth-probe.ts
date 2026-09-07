export default async function handler(req:any,res:any){
  const base=(process.env.VITE_SUPABASE_URL||'https://ygqqtudavuugrvpkhvdp.supabase.co').replace(/\/$/,'');
  const key=process.env.VITE_SUPABASE_ANON_KEY||'';
  if(!key) return res.status(200).json({ok:false,stage:'config',error:'missing_anon_key'});
  const started=Date.now();
  try{
    const r=await fetch(base+'/auth/v1/token?grant_type=password',{
      method:'POST',
      headers:{'content-type':'application/json',apikey:key,authorization:`Bearer ${key}`},
      body:JSON.stringify({email:'admin.auth@kimshop.local',password:'__kimshop_probe_invalid_password__'}),
      signal:AbortSignal.timeout(12000),
    });
    const text=await r.text();
    return res.status(200).json({ok:true,upstreamStatus:r.status,ms:Date.now()-started,body:text.slice(0,240)});
  }catch(e:any){
    return res.status(200).json({ok:false,stage:'fetch',ms:Date.now()-started,error:String(e?.message||e)});
  }
}
