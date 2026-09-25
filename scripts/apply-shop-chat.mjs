import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let source = readFileSync(path, 'utf8');
function replaceOnce(before, after) {
  if (!source.includes(before) || source.split(before).length !== 2) throw new Error(`Chat integration anchor missing/duplicated: ${before.slice(0, 70)}`);
  source = source.replace(before, after);
}

replaceOnce("const BuyerPurchasePage = lazy(() => import('./BuyerPurchasePage'));", "const BuyerPurchasePage = lazy(() => import('./BuyerPurchasePage'));\nconst ShopChat = lazy(() => import('./ShopChat'));");
replaceOnce("import { supabase, usernameToEmail, usernameToLegacyEmail, isValidUsername } from './supabaseClient';", "import { supabase, usernameToEmail, usernameToLegacyEmail, isValidUsername } from './supabaseClient';\nimport { enablePushNotifications } from './pushClient';");
replaceOnce("{ key: 'placeholder', label: 'Quản Lý Chat', icon: MessageCircle }", "{ key: 'chat', label: 'Quản Lý Chat', icon: MessageCircle }");
replaceOnce("  const [authModal, setAuthModal] = useState(null); // null | 'login' | 'register' | 'apply'", "  const [authModal, setAuthModal] = useState(null); // null | 'login' | 'register' | 'apply'\n  const [chatTarget, setChatTarget] = useState<{shopId?:string;buyerId?:string;orderId?:string;label?:string}|null>(null);");
replaceOnce("  const doLogout = async () => {\n    await supabase.auth.signOut();", "  const doLogout = async () => {\n    await import('./pushClient').then((m) => m.disconnectPushNotifications()).catch(() => {});\n    await supabase.auth.signOut();");
replaceOnce("  const [toast, setToast] = useState('');", "  const [toast, setToast] = useState('');\n  const [unreadChats, setUnreadChats] = useState(0);\n  const lastUnreadRef = useRef<{userId:string;count:number|null}>({userId:'',count:null});");
replaceOnce("  const [unreadChats, setUnreadChats] = useState(0);", "  const [unreadChats, setUnreadChats] = useState(0);\n  const [pushWelcomeVisible, setPushWelcomeVisible] = useState(false);\n  const [pushWelcomeBusy, setPushWelcomeBusy] = useState(false);\n  const [pushWelcomeError, setPushWelcomeError] = useState('');");
replaceOnce("  const myShop = currentUser ? shops.find((s) => s.ownerId === currentUser.id) : null;", `  const myShop = currentUser ? shops.find((s) => s.ownerId === currentUser.id) : null;
  const openShopChat = (target: {shopId?:string;buyerId?:string;orderId?:string;label?:string} = {}) => {
    if (!currentUser?.id) { setAuthModal('login'); showToast('Đăng nhập để nhắn tin cho shop'); return; }
    if (target.label && !target.shopId) { showToast('Không xác định được shop để nhắn tin'); return; }
    if (target.shopId && !/^[0-9a-f-]{36}$/i.test(target.shopId)) { showToast('Không xác định được shop'); return; }
    setChatTarget(target);
  };
  useEffect(() => {
    const userId = currentUser?.id;
    if (!userId) { setUnreadChats(0); lastUnreadRef.current = {userId:'',count:null}; return; }
    if (lastUnreadRef.current.userId !== userId) lastUnreadRef.current = {userId,count:null};
    if (chatTarget) return;
    let stopped = false;
    const check = async () => {
      if (document.hidden) return;
      try {
        const {data} = await supabase.auth.getSession();
        if (!data.session?.access_token) return;
        const query = new URLSearchParams({action:'unread'});
        if (myShop?.id) query.set('shopId',myShop.id);
        const response = await fetch('/api/chat?' + query, {headers:{Authorization:'Bearer ' + data.session.access_token},cache:'no-store'});
        if (!response.ok) return;
        const count = Number((await response.json()).unread) || 0;
        if (stopped) return;
        if (lastUnreadRef.current.count !== null && count > lastUnreadRef.current.count) showToast('Bạn có tin nhắn mới. Nhấn vào biểu tượng chat để xem.');
        lastUnreadRef.current = {userId,count};
        setUnreadChats(count);
        if (count) void navigator.setAppBadge?.(count).catch(() => {});
        else void navigator.clearAppBadge?.().catch(() => {});
      } catch { /* Chat notification is best effort. */ }
    };
    void check();
    const timer = window.setInterval(check,30000);
    document.addEventListener('visibilitychange',check);
    window.addEventListener('kimshop:chat-read',check);
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener('visibilitychange',check); window.removeEventListener('kimshop:chat-read',check); };
  }, [currentUser?.id,myShop?.id,!!chatTarget]);
  useEffect(() => {
    if (!currentUser?.id) return;
    if (new URLSearchParams(window.location.search).has('chat')) {
      setChatTarget({});
      const url = new URL(window.location.href);
      url.searchParams.delete('chat');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
    if (!('serviceWorker' in navigator)) return;
    const onPushClick = (event: MessageEvent) => {
      if (event.data?.type === 'kimshop-open-chat') setChatTarget({});
    };
    navigator.serviceWorker.addEventListener('message', onPushClick);
    return () => navigator.serviceWorker.removeEventListener('message', onPushClick);
  }, [currentUser?.id]);
  useEffect(() => {
    if (!currentUser?.id) { setPushWelcomeVisible(false); return; }
    if (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator) || Notification.permission !== 'default') return;
    const installed = Boolean((navigator as Navigator & {standalone?:boolean}).standalone) ||
      window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches;
    if (!installed) return;
    try { if (window.localStorage.getItem('kimshop-push-welcome:' + currentUser.id)) return; } catch {}
    const timer = window.setTimeout(() => setPushWelcomeVisible(true), 1200);
    return () => window.clearTimeout(timer);
  }, [currentUser?.id]);
  const dismissPushWelcome = () => {
    try { window.localStorage.setItem('kimshop-push-welcome:' + currentUser?.id, 'later'); } catch {}
    setPushWelcomeVisible(false);
  };
  const acceptPushWelcome = async () => {
    setPushWelcomeBusy(true);
    setPushWelcomeError('');
    try {
      await enablePushNotifications();
      try { window.localStorage.setItem('kimshop-push-welcome:' + currentUser?.id, 'enabled'); } catch {}
      setPushWelcomeVisible(false);
      showToast('Đã bật thông báo tin nhắn trên điện thoại');
    } catch (error:any) {
      setPushWelcomeError(error?.message || 'Không bật được thông báo. Vui lòng thử lại.');
    } finally { setPushWelcomeBusy(false); }
  };`);
replaceOnce("    goSellerPage(item.key);\n  };\n\n  const isMenuItemActive", "    if (item.key === 'chat') { openShopChat({}); return; }\n    goSellerPage(item.key);\n  };\n\n  const isMenuItemActive");
replaceOnce('<div className="min-h-screen bg-[#F5F5F5] font-sans text-xs text-[#333333] relative">', `<div className="min-h-screen bg-[#F5F5F5] font-sans text-xs text-[#333333] relative">
      {currentUser && !chatTarget && <button type="button" aria-label={unreadChats ? 'Tin nhắn, ' + unreadChats + ' cuộc trò chuyện chưa đọc' : 'Mở tin nhắn'} title="Tin nhắn" onClick={() => openShopChat({})} className="fixed bottom-[9.25rem] right-3.5 z-[70] flex h-12 w-12 items-center justify-center rounded-full bg-[#EE4D2D] text-white shadow-lg shadow-orange-300/50 hover:bg-[#f63]"><MessageCircle size={21} />{unreadChats > 0 && <span className="absolute -top-1.5 -right-1.5 flex min-w-5 h-5 items-center justify-center rounded-full border-2 border-white bg-red-600 px-0.5 text-[10px] font-bold text-white">{unreadChats > 9 ? '9+' : unreadChats}</span>}</button>}
      {chatTarget && currentUser && <Suspense fallback={null}><ShopChat key={JSON.stringify(chatTarget)} userId={currentUser.id} sellerShopId={myShop?.id || null} isAdmin={currentUser.role === 'admin'} target={chatTarget} onClose={() => setChatTarget(null)} /></Suspense>}`);
replaceOnce("      {chatTarget && currentUser && <Suspense fallback={null}><ShopChat key={JSON.stringify(chatTarget)} userId={currentUser.id} sellerShopId={myShop?.id || null} isAdmin={currentUser.role === 'admin'} target={chatTarget} onClose={() => setChatTarget(null)} /></Suspense>}", `      {chatTarget && currentUser && <Suspense fallback={null}><ShopChat key={JSON.stringify(chatTarget)} userId={currentUser.id} sellerShopId={myShop?.id || null} isAdmin={currentUser.role === 'admin'} target={chatTarget} onClose={() => setChatTarget(null)} /></Suspense>}
      {pushWelcomeVisible && !chatTarget && currentUser && <section role="dialog" aria-label="Cho phép thông báo KIMSHOP" className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-3 right-3 z-[110] mx-auto max-w-sm rounded-2xl border border-orange-100 bg-white p-4 text-sm shadow-2xl">
        <div className="flex items-start gap-3"><Bell size={22} className="mt-0.5 shrink-0 text-[#EE4D2D]" /><div><strong className="block text-gray-900">Nhận tin nhắn từ KIMSHOP</strong><p className="mt-1 text-xs leading-relaxed text-gray-600">Nhận thông báo trên điện thoại khi có tin mới, kể cả lúc bạn đóng app. Âm báo theo cài đặt iPhone.</p></div></div>
        {pushWelcomeError && <p role="alert" className="mt-2 text-xs text-red-600">{pushWelcomeError}</p>}
        <div className="mt-3 flex gap-2"><button type="button" onClick={acceptPushWelcome} disabled={pushWelcomeBusy} className="flex-1 rounded-lg bg-[#EE4D2D] px-3 py-2.5 font-semibold text-white disabled:opacity-60">{pushWelcomeBusy ? 'Đang bật...' : 'Cho phép thông báo'}</button><button type="button" onClick={dismissPushWelcome} className="rounded-lg bg-gray-100 px-3 py-2.5 text-gray-700">Để sau</button></div>
      </section>}`);
replaceOnce("<BuyerPurchasePage purchaseTab={purchaseTab}", "<BuyerPurchasePage onChat={(ord:any) => openShopChat({shopId:ord.shopId,orderId:ord.id,label:ord.shopName})} purchaseTab={purchaseTab}");
const mobileMarker = `                  type="button"\n                  className="w-14 flex-shrink-0 flex flex-col items-center justify-center gap-0.5 text-[#EE4D2D] border border-[#EE4D2D]/30 rounded-lg text-[10px] font-medium hover:bg-[#FFF4F1] transition-colors"`;
replaceOnce(mobileMarker, `                  type="button"\n                  onClick={() => openShopChat({shopId:selectedProduct.shopId || shops.find((s:any) => s.ownerId === selectedProduct.sellerId)?.id,label:selectedProduct.shopName})}\n                  className="w-14 flex-shrink-0 flex flex-col items-center justify-center gap-0.5 text-[#EE4D2D] border border-[#EE4D2D]/30 rounded-lg text-[10px] font-medium hover:bg-[#FFF4F1] transition-colors"`);
replaceOnce(`<button className="bg-[#EE4D2D] text-white px-3.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 hover:bg-[#f63] transition-colors"><MessageCircle size={12} /> Chat</button>`, `<button onClick={() => openShopChat({shopId:selectedProduct.shopId || shops.find((s:any) => s.ownerId === selectedProduct.sellerId)?.id,label:selectedProduct.shopName})} className="bg-[#EE4D2D] text-white px-3.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 hover:bg-[#f63] transition-colors"><MessageCircle size={12} /> Chat</button>`);
replaceOnce(`                              </select>\n                            </td>\n                          </tr>\n                        ))}\n                      </tbody>`, `                              </select>\n                              <button type="button" onClick={() => openShopChat({shopId:o.shopId,buyerId:o.buyerId,orderId:o.id,label:o.customerName})} className="ml-2 inline-flex items-center gap-1 rounded bg-orange-50 px-2 py-1 text-[11px] font-semibold text-[#EE4D2D]"><MessageCircle size={12}/>Nhắn khách</button>\n                            </td>\n                          </tr>\n                        ))}\n                      </tbody>`);
replaceOnce(`<button className="border border-gray-300 text-gray-600 px-3.5 py-1.5 rounded-sm text-[11px] flex items-center gap-1"><MessageCircle size={12} /> Chat ngay</button>`, `<button type="button" onClick={() => openShopChat({shopId:o.shopId,buyerId:o.buyerId,orderId:o.id,label:o.customerName})} className="border border-gray-300 text-gray-600 px-3.5 py-1.5 rounded-sm text-[11px] flex items-center gap-1 hover:border-[#EE4D2D] hover:text-[#EE4D2D]"><MessageCircle size={12} /> Chat ngay</button>`);
writeFileSync(path, source);
console.log('[KIMSHOP CHAT] linked product, buyer orders, seller orders and inbox');
