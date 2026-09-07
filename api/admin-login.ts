export default async function handler(req:any,res:any){
  if(req.method!=='POST') return res.status(405).json({error:'method_not_allowed'});
  const base=(process.env.VITE_SUPABASE_URL||'https://ygqqtudavuugrvpkhvdp.supabase.co').replace(/\/$/,'');
  const key=process.env.VITE_SUPABASE_ANON_KEY||'';
  if(!key) return res.status(500).json({error:'missing_anon_key'});
  const password=String(req.body?.password||'');
  if(!password) return res.status(400).json({error:'missing_password'});
  try{
    const r=await fetch(base+'/auth/v1/token?grant_type=password',{
      method:'POST',
      headers:{'content-type':'application/json',apikey:key,authorization:`Bearer ${key}`},
      body:JSON.stringify({email:'admin.auth@kimshop.local',password}),
      signal:AbortSignal.timeout(12000),
    });
    const text=await r.text();
    let body:any={}; try{body=JSON.parse(text)}catch{body={message:text}}
    if(!r.ok) return res.status(r.status).json({error:body?.error_description||body?.msg||body?.message||'auth_failed'});
    return res.status(200).json({access_token:body.access_token,refresh_token:body.refresh_token,expires_in:body.expires_in,user:body.user});
  }catch(e:any){
    return res.status(504).json({error:String(e?.message||e)});
  }
}
