import { readFileSync, writeFileSync } from 'node:fs';
const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let n=0;
const replaceOnce=(from,to,label)=>{const c=s.split(from).length-1;if(c!==1)throw new Error(`[session/bulk] ${label} found ${c}, expected 1`);s=s.replace(from,to);n++;};

// Màn Mua Nhiều Giảm Giá cần catalog để xác định đúng shopId và danh sách shop.
replaceOnce(
"['products','addProduct','reviews','flashSaleAdmin','analytics'].includes(sellerPage)",
"['products','addProduct','reviews','flashSaleAdmin','analytics','variantQtyVouchers'].includes(sellerPage)",
'bulk screen catalog hydration');

// Khi khôi phục session sau F5, retry profile vài lần nếu Supabase vừa chậm/timeout.
replaceOnce(
"    const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();\n    if (error || !profile) { console.error('Không tải được hồ sơ tài khoản', error); return; }",
"    let profile:any=null; let profileError:any=null;\n    for (let attempt=0; attempt<3 && !profile; attempt++) {\n      const r = await supabase.from('profiles').select('*').eq('id', session.user.id).single();\n      profile = r.data; profileError = r.error;\n      if (!profile && attempt < 2) await new Promise(res=>window.setTimeout(res, attempt===0?250:650));\n    }\n    if (profileError || !profile) { console.error('Không tải được hồ sơ tài khoản sau retry', profileError); return; }",
'profile restore retry');

// Không chỉ phụ thuộc INITIAL_SESSION: đọc session lưu trong localStorage chủ động khi app mount.
replaceOnce(
"    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {\n      loadUserSession(session);\n    });",
"    let authRestoreDead=false;\n    supabase.auth.getSession().then(({data,error})=>{\n      if(authRestoreDead) return;\n      if(error) console.error('Không khôi phục được session đã lưu',error);\n      else loadUserSession(data.session);\n    }).catch(e=>console.error('Lỗi khôi phục session',e));\n    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {\n      if (_event !== 'INITIAL_SESSION') loadUserSession(session);\n    });",
'explicit auth restore');

replaceOnce(
"return ()=>{cancelled=true; supabase.removeChannel(ch); authListener.subscription.unsubscribe();};",
"return ()=>{cancelled=true; authRestoreDead=true; supabase.removeChannel(ch); authListener.subscription.unsubscribe();};",
'auth restore cleanup');

writeFileSync(path,s,'utf8');
console.log(`[KIMSHOP FIX] session restore + bulk discount screen hydration applied: ${n}`);
