import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let source = readFileSync(path, 'utf8');
function replaceOnce(before, after) {
  if (!source.includes(before) || source.split(before).length !== 2) throw new Error(`Chat integration anchor missing/duplicated: ${before.slice(0, 70)}`);
  source = source.replace(before, after);
}

replaceOnce("const BuyerPurchasePage = lazy(() => import('./BuyerPurchasePage'));", "const BuyerPurchasePage = lazy(() => import('./BuyerPurchasePage'));\nconst ShopChat = lazy(() => import('./ShopChat'));");
replaceOnce("{ key: 'placeholder', label: 'Quản Lý Chat', icon: MessageCircle }", "{ key: 'chat', label: 'Quản Lý Chat', icon: MessageCircle }");
replaceOnce("  const [authModal, setAuthModal] = useState(null); // null | 'login' | 'register' | 'apply'", "  const [authModal, setAuthModal] = useState(null); // null | 'login' | 'register' | 'apply'\n  const [chatTarget, setChatTarget] = useState<{shopId?:string;buyerId?:string;orderId?:string;label?:string}|null>(null);");
replaceOnce("  const myShop = currentUser ? shops.find((s) => s.ownerId === currentUser.id) : null;", `  const myShop = currentUser ? shops.find((s) => s.ownerId === currentUser.id) : null;
  const openShopChat = (target: {shopId?:string;buyerId?:string;orderId?:string;label?:string} = {}) => {
    if (!currentUser?.id) { setAuthModal('login'); showToast('Đăng nhập để nhắn tin cho shop'); return; }
    if (target.label && !target.shopId) { showToast('Không xác định được shop để nhắn tin'); return; }
    if (target.shopId && !/^[0-9a-f-]{36}$/i.test(target.shopId)) { showToast('Không xác định được shop'); return; }
    setChatTarget(target);
  };`);
replaceOnce("    goSellerPage(item.key);\n  };\n\n  const isMenuItemActive", "    if (item.key === 'chat') { openShopChat({}); return; }\n    goSellerPage(item.key);\n  };\n\n  const isMenuItemActive");
replaceOnce('<div className="min-h-screen bg-[#F5F5F5] font-sans text-xs text-[#333333] relative">', `<div className="min-h-screen bg-[#F5F5F5] font-sans text-xs text-[#333333] relative">
      {currentUser && !chatTarget && <button type="button" aria-label="Mở tin nhắn" onClick={() => openShopChat({})} className="fixed bottom-24 right-4 z-[49] flex h-12 w-12 items-center justify-center rounded-full bg-[#EE4D2D] text-white shadow-lg hover:bg-[#df4325]"><MessageCircle size={23} /></button>}
      {chatTarget && currentUser && <Suspense fallback={null}><ShopChat key={JSON.stringify(chatTarget)} userId={currentUser.id} sellerShopId={view === 'seller' ? myShop?.id : null} target={chatTarget} onClose={() => setChatTarget(null)} /></Suspense>}`);
replaceOnce("<BuyerPurchasePage purchaseTab={purchaseTab}", "<BuyerPurchasePage onChat={(ord:any) => openShopChat({shopId:ord.shopId,orderId:ord.id,label:ord.shopName})} purchaseTab={purchaseTab}");
const mobileMarker = `                  type="button"\n                  className="w-14 flex-shrink-0 flex flex-col items-center justify-center gap-0.5 text-[#EE4D2D] border border-[#EE4D2D]/30 rounded-lg text-[10px] font-medium hover:bg-[#FFF4F1] transition-colors"`;
replaceOnce(mobileMarker, `                  type="button"\n                  onClick={() => openShopChat({shopId:selectedProduct.shopId || shops.find((s:any) => s.ownerId === selectedProduct.sellerId)?.id,label:selectedProduct.shopName})}\n                  className="w-14 flex-shrink-0 flex flex-col items-center justify-center gap-0.5 text-[#EE4D2D] border border-[#EE4D2D]/30 rounded-lg text-[10px] font-medium hover:bg-[#FFF4F1] transition-colors"`);
replaceOnce(`<button className="bg-[#EE4D2D] text-white px-3.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 hover:bg-[#f63] transition-colors"><MessageCircle size={12} /> Chat</button>`, `<button onClick={() => openShopChat({shopId:selectedProduct.shopId || shops.find((s:any) => s.ownerId === selectedProduct.sellerId)?.id,label:selectedProduct.shopName})} className="bg-[#EE4D2D] text-white px-3.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 hover:bg-[#f63] transition-colors"><MessageCircle size={12} /> Chat</button>`);
replaceOnce(`                              </select>\n                            </td>\n                          </tr>\n                        ))}\n                      </tbody>`, `                              </select>\n                              <button type="button" onClick={() => openShopChat({shopId:o.shopId,buyerId:o.buyerId,orderId:o.id,label:o.customerName})} className="ml-2 inline-flex items-center gap-1 rounded bg-orange-50 px-2 py-1 text-[11px] font-semibold text-[#EE4D2D]"><MessageCircle size={12}/>Nhắn khách</button>\n                            </td>\n                          </tr>\n                        ))}\n                      </tbody>`);
writeFileSync(path, source);
console.log('[KIMSHOP CHAT] linked product, buyer orders, seller orders and inbox');
