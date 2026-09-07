export default async function handler(req:any,res:any){
  const base=(process.env.VITE_SUPABASE_URL||'https://ygqqtudavuugrvpkhvdp.supabase.co').replace(/\/$/,'');
  const started=Date.now();
  try{
    const r=await fetch(base+'/auth/v1/health',{signal:AbortSignal.timeout(8000)});
    const text=await r.text();
    res.status(200).json({ok:r.ok,status:r.status,ms:Date.now()-started,body:text.slice(0,300)});
  }catch(e:any){
    res.status(200).json({ok:false,ms:Date.now()-started,error:String(e?.message||e)});
  }
}
