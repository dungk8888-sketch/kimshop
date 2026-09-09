import { readFileSync, writeFileSync } from 'node:fs';
const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const anchor=`  const addToCart = (product, variant, qty) => {`;
if(!s.includes(anchor)) throw new Error('[cart qty debounce] addToCart anchor not found');
const helper=`  // Debounce Supabase writes per cart row. UI remains immediate.
  const cartQtyWriteRef = useRef<Record<string, { timer:any; latestQty:number; sending:boolean; resendNeeded:boolean; cancelled:boolean; inFlight:Promise<any>|null; userId:string; productId:string; variant:string }>>({});
  const CART_QTY_WRITE_DEBOUNCE_MS=500;
  const sendCartQtyWrite=(key:string)=>{
    const entry=cartQtyWriteRef.current[key]; if(!entry||entry.cancelled)return;
    entry.timer=null;
    if(entry.sending){entry.resendNeeded=true;return;}
    entry.sending=true;
    const request=upsertCartItemDb(entry.userId,entry.productId,entry.variant,entry.latestQty);
    entry.inFlight=request;
    request.finally(()=>{
      const cur=cartQtyWriteRef.current[key]; if(!cur||cur!==entry)return;
      cur.sending=false; cur.inFlight=null;
      if(!cur.cancelled&&cur.resendNeeded){cur.resendNeeded=false;sendCartQtyWrite(key);}
    });
  };
  const scheduleCartQtyWrite=(userId:string,productId:string,variant:string,qty:number)=>{
    const key=cartKey(productId,variant);
    const entry=cartQtyWriteRef.current[key]||{timer:null,latestQty:qty,sending:false,resendNeeded:false,cancelled:false,inFlight:null,userId,productId,variant};
    entry.latestQty=qty;entry.userId=userId;entry.productId=productId;entry.variant=variant;entry.cancelled=false;
    if(entry.timer)clearTimeout(entry.timer);
    entry.timer=window.setTimeout(()=>sendCartQtyWrite(key),CART_QTY_WRITE_DEBOUNCE_MS);
    cartQtyWriteRef.current[key]=entry;
  };
  const flushCartQtyWrite=(key:string)=>{const e=cartQtyWriteRef.current[key];if(!e||!e.timer)return;clearTimeout(e.timer);sendCartQtyWrite(key);};
  const flushAllCartQtyWrites=()=>Object.keys(cartQtyWriteRef.current).forEach(flushCartQtyWrite);
  const cancelCartQtyWrite=async(key:string)=>{
    const e=cartQtyWriteRef.current[key];if(!e)return;
    if(e.timer)clearTimeout(e.timer);e.timer=null;e.cancelled=true;e.resendNeeded=false;
    // Serialize delete after any already in-flight upsert so an old write cannot resurrect a deleted row.
    if(e.inFlight){try{await e.inFlight;}catch{}}
    if(cartQtyWriteRef.current[key]===e)delete cartQtyWriteRef.current[key];
  };
  const cancelCartQtyWriteThenDelete=async(key:string,userId:string,productId:string,variant:string)=>{await cancelCartQtyWrite(key);return deleteCartItemDb(userId,productId,variant);};
  const prevBuyerPageForCartFlushRef=useRef(buyerPage);
  useEffect(()=>{const prev=prevBuyerPageForCartFlushRef.current;if((prev==='cart'||prev==='checkout')&&buyerPage!==prev)flushAllCartQtyWrites();prevBuyerPageForCartFlushRef.current=buyerPage;},[buyerPage]);
  useEffect(()=>{const vis=()=>{if(document.hidden)flushAllCartQtyWrites();};const hide=()=>flushAllCartQtyWrites();document.addEventListener('visibilitychange',vis);window.addEventListener('pagehide',hide);return()=>{document.removeEventListener('visibilitychange',vis);window.removeEventListener('pagehide',hide);};},[]);

`;
s=s.replace(anchor,helper+anchor);

const oldQty=`  const updateCartQty = (key, delta) => {
    const current = cart.find((c) => c.key === key);
    if (!current) return;
    const product = products.find((p) => p.id === current.productId);
    const max = product ? cartAvailableStock(product, current.variant) : 99;
    const newQty = Math.max(1, Math.min(current.qty + delta, max));
    setCart((prev) => prev.map((c) => (c.key === key ? { ...c, qty: newQty } : c)));
    if (currentUser) upsertCartItemDb(currentUser.id, current.productId, current.variant, newQty);
  };`;
if(!s.includes(oldQty))throw new Error('[cart qty debounce] updateCartQty not found');
s=s.replace(oldQty,`  const updateCartQty = (key, delta) => {
    const current = cart.find((c) => c.key === key);
    if (!current) return;
    const product = products.find((p) => p.id === current.productId);
    const max = product ? cartAvailableStock(product, current.variant) : 99;
    const newQty = Math.max(1, Math.min(current.qty + delta, max));
    setCart((prev) => prev.map((c) => (c.key === key ? { ...c, qty: newQty } : c)));
    if (currentUser) scheduleCartQtyWrite(currentUser.id, current.productId, current.variant, newQty);
  };`);

const oldRemove=`  const removeCartItem = (key) => {
    const current = cart.find((c) => c.key === key);
    setCart((prev) => prev.filter((c) => c.key !== key));
    setSelectedCartIds((prev) => prev.filter((k) => k !== key));
    if (currentUser && current) deleteCartItemDb(currentUser.id, current.productId, current.variant);
  };`;
if(!s.includes(oldRemove))throw new Error('[cart qty debounce] removeCartItem not found');
s=s.replace(oldRemove,`  const removeCartItem = (key) => {
    const current = cart.find((c) => c.key === key);
    setCart((prev) => prev.filter((c) => c.key !== key));
    setSelectedCartIds((prev) => prev.filter((k) => k !== key));
    if (currentUser && current) void cancelCartQtyWriteThenDelete(key,currentUser.id,current.productId,current.variant);
    else void cancelCartQtyWrite(key);
  };`);

const oldCleanup=`        const purchasedKeys = checkoutItems.map((c) => c.key);
        const purchasedEntries = checkoutItems.map((c) => ({ productId: c.productId, variant: c.variant }));
        setCart((prev) => prev.filter((c) => !purchasedKeys.includes(c.key)));
        setSelectedCartIds((prev) => prev.filter((k) => !purchasedKeys.includes(k)));
        if (currentUser) purchasedEntries.forEach((i) => deleteCartItemDb(currentUser.id, i.productId, i.variant));`;
if(!s.includes(oldCleanup))throw new Error('[cart qty debounce] checkout cleanup not found');
s=s.replace(oldCleanup,`        const purchasedKeys = checkoutItems.map((c) => c.key);
        const purchasedEntries = checkoutItems.map((c) => ({ productId: c.productId, variant: c.variant }));
        setCart((prev) => prev.filter((c) => !purchasedKeys.includes(c.key)));
        setSelectedCartIds((prev) => prev.filter((k) => !purchasedKeys.includes(k)));
        if (currentUser) purchasedEntries.forEach((i,index) => { void cancelCartQtyWriteThenDelete(purchasedKeys[index],currentUser.id,i.productId,i.variant); });
        else purchasedKeys.forEach((key)=>{void cancelCartQtyWrite(key);});`);

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP PERF] cart +/- writes debounced 500ms; delete serialized after in-flight qty writes');