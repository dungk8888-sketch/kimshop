import React, { useState, useRef, useEffect } from 'react';
import { supabase } from './supabaseClient';
import {
  ShoppingCart, Search, Heart, Star, Bell, HelpCircle, MessageCircle, Store,
  Plus, Minus, Trash2, Pencil, Package, BarChart3, LayoutDashboard, ListOrdered,
  AlertTriangle, X, Truck, ChevronLeft, Check, LogOut, ImagePlus, Wallet,
  CreditCard, Sparkles, RotateCcw, Settings, TrendingUp, Users, ChevronDown, Copy, Zap,
  User, LogIn, UserPlus, MapPin, Eye, Lock, Mail, ShieldCheck, Loader2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

/* ============================== DỮ LIỆU MẪU ============================== */

const SELLER_SHOP = 'Kim Shop Mobile';
const SELLER_USERNAME = 'kimshopmobile';
const SHIPPING_FEE = 20000;
const FREE_SHIP_THRESHOLD = 300000;
const ORANGE = '#EE4D2D';

const dbProductToUi = (p:any, images:any[]=[], variants:any[]=[]) => ({...p, image: images.find(x=>x.sort_order===0)?.public_url || images[0]?.public_url || '', images: images.sort((a,b)=>a.sort_order-b.sort_order).map(x=>x.public_url).filter(Boolean), variants: variants.sort((a,b)=>a.sort_order-b.sort_order).map(v=>({id:v.id,name:v.name,price:Number(v.price ?? p.price),stock:v.stock}))});
const uiProductToDb = (p:any, userId:string|null) => ({id: p.id?.length===36?p.id:undefined, seller_id:userId, name:p.name, description:p.description||'', category:p.category||'', price:Number(p.price||0), original_price:Number(p.originalPrice ?? p.original_price ?? p.price ?? 0), stock:Number(p.stock||0), sold:Number(p.sold||0), rating:Number(p.rating||0), status:'active'});
const loadRemoteData = async () => {
  const [ps, ss, os, apps, snapshot] = await Promise.all([
    supabase.from('products').select('*').neq('status','deleted').order('created_at',{ascending:false}),
    supabase.from('shops').select('*').order('created_at',{ascending:false}),
    supabase.from('orders').select('*').order('created_at',{ascending:false}),
    supabase.from('seller_applications').select('*').order('created_at',{ascending:false}),
    supabase.from('app_state').select('payload').eq('key','global:catalog').maybeSingle()
  ]);
  if(ps.error) throw ps.error; if(ss.error) throw ss.error; if(os.error) throw os.error; if(apps.error) throw apps.error;
  const ids=(ps.data||[]).map((p:any)=>p.id);
  const [imgs, vars] = await Promise.all([
    ids.length ? supabase.from('product_images').select('*').in('product_id',ids) : Promise.resolve({data:[],error:null} as any),
    ids.length ? supabase.from('product_variants').select('*').in('product_id',ids) : Promise.resolve({data:[],error:null} as any)
  ]);
  const snapshotData=(snapshot as any)?.data?.payload;
  if(snapshotData && snapshotData.products) return snapshotData;
  const products=(ps.data||[]).map((p:any)=>dbProductToUi(p,(imgs.data||[]).filter((x:any)=>x.product_id===p.id),(vars.data||[]).filter((x:any)=>x.product_id===p.id)));
  const shops=(ss.data||[]).map((s:any)=>({id:s.id,name:s.name,ownerId:s.owner_id,status:s.status,logo:s.logo_url,description:s.description}));
  const orders=(os.data||[]).map((o:any)=>({...o,orderStatus:o.status, buyerId:o.buyer_id, shopId:o.shop_id, total:o.total_amount, createdAt:o.created_at}));
  return {products,shops,orders,sellerApplications:apps.data||[]};
};


const CATEGORIES = ['Tất cả', 'Phụ Kiện Điện Thoại', 'Điện Máy', 'Gia Dụng', 'Thời Trang Nam', 'Mẹ & Bé'];

const VOUCHERS = {
  FREESHIP: { type: 'shipping', label: 'Miễn phí vận chuyển' },
  GIAM10: { type: 'percent', value: 10, label: 'Giảm 10%, tối đa 50K' },
  GIAM20K: { type: 'fixed', value: 20000, label: 'Giảm trực tiếp 20.000đ' },
};

/* ============================== TÀI KHOẢN / PHÂN QUYỀN ============================== */
const DEFAULT_SHOP_ID = 'shop_admin';

const REVENUE_TREND = [
  { day: 'T2', revenue: 890000 }, { day: 'T3', revenue: 1240000 }, { day: 'T4', revenue: 760000 },
  { day: 'T5', revenue: 1580000 }, { day: 'T6', revenue: 2010000 }, { day: 'T7', revenue: 1750000 },
  { day: 'CN', revenue: 2360000 },
];

/* ============================== HÀM TIỆN ÍCH ============================== */

const formatVND = (n) => '₫' + Math.round(n).toLocaleString('vi-VN');
const formatSold = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : String(n));
const cartKey = (productId, variant) => `${productId}__${variant}`;
const todayStr = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
};
const nowTimeStr = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${todayStr()}`;
};
const addDays = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
};

const STATUS_STYLES = {
  'Chờ thanh toán': 'bg-amber-50 text-amber-600',
  'Vận chuyển': 'bg-blue-50 text-blue-600',
  'Chờ giao hàng': 'bg-orange-50 text-[#EE4D2D]',
  'Hoàn thành': 'bg-emerald-50 text-emerald-600',
  'Đã hủy': 'bg-gray-100 text-gray-500',
  'Trả hàng/Hoàn tiền': 'bg-rose-50 text-rose-600',
};

const ORDER_STATUS_OPTIONS = ['Chờ thanh toán', 'Vận chuyển', 'Chờ giao hàng', 'Hoàn thành', 'Đã hủy', 'Trả hàng/Hoàn tiền'];

const CARRIERS = ['SPX Express', 'Giao Hàng Nhanh', 'Ninja Van', 'VNPost Nhanh', 'J&T Express', 'GHN - Hàng Cồng Kềnh'];

// Nhãn tab cho Kênh Người Bán, ánh xạ sang trạng thái đơn hàng nội bộ
const SELLER_ORDER_TABS = [
  { key: 'TatCa', label: 'Tất cả', status: null },
  { key: 'ChoXacNhan', label: 'Chờ xác nhận', status: 'Chờ thanh toán' },
  { key: 'ChoLayHang', label: 'Chờ lấy hàng', status: 'Chờ giao hàng' },
  { key: 'DangGiao', label: 'Đang giao', status: 'Vận chuyển' },
  { key: 'DaGiao', label: 'Đã giao', status: 'Hoàn thành' },
  { key: 'DonHuy', label: 'Đơn Hủy', status: 'Đã hủy' },
  { key: 'TraHang', label: 'Trả hàng/Hoàn tiền', status: 'Trả hàng/Hoàn tiền' },
];

// Cấu trúc menu Kênh Người Bán
const SELLER_MENU = [
  {
    group: 'Quản Lý Đơn Hàng',
    items: [
      { key: 'orders', label: 'Tất cả' },
      { key: 'bulkShipping', label: 'Giao Hàng Loạt', icon: Truck },
      { key: 'handover', label: 'Bàn Giao Đơn Hàng', icon: Truck },
      { key: 'returns', label: 'Đơn Trả hàng/Hoàn tiền hoặc Đơn hủy', icon: RotateCcw },
      { key: 'placeholder', label: 'Cài Đặt Vận Chuyển', icon: Settings },
    ],
  },
  {
    group: 'Quản Lý Sản Phẩm',
    items: [
      { key: 'products', label: 'Tất Cả Sản Phẩm' },
      { key: 'addProduct', label: 'Thêm Sản Phẩm' },
      { key: 'placeholder', label: 'Sản phẩm tiêu chuẩn', icon: Package },
      { key: 'placeholder', label: 'Công cụ Tối ưu AI', icon: Sparkles },
    ],
  },
  {
    group: 'Kênh Marketing',
    items: [
      { key: 'shopDecor', label: 'Trang Trí Shop', icon: Sparkles },
      { key: 'flashSaleAdmin', label: 'Flash Sale Của Shop', icon: Zap },
    ],
  },
  {
    group: 'Chăm Sóc Khách Hàng',
    items: [
      { key: 'placeholder', label: 'Quản Lý Chat', icon: MessageCircle },
      { key: 'reviews', label: 'Quản Lý Đánh Giá' },
    ],
  },
  {
    group: 'Tài Chính',
    items: [
      { key: 'finance', label: 'Doanh Thu' },
      { key: 'placeholder', label: 'Số dư TK Shopee Mini', icon: Wallet },
      { key: 'placeholder', label: 'Tài Khoản Ngân Hàng', icon: CreditCard },
    ],
  },
  {
    group: 'Dữ Liệu',
    items: [
      { key: 'analytics', label: 'Phân Tích Bán Hàng' },
      { key: 'placeholder', label: 'Hiệu Quả Hoạt Động', icon: TrendingUp },
    ],
  },
];

function StarRating({ value, size = 12, showValue = false }) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <span className="inline-flex items-center gap-0.5">
      {stars.map((s) => (
        <Star
          key={s}
          size={size}
          className={s <= Math.round(value) ? 'fill-[#EE4D2D] text-[#EE4D2D]' : 'fill-gray-200 text-gray-200'}
        />
      ))}
      {showValue && <span className="ml-1 text-gray-500">{value.toFixed(1)}</span>}
    </span>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div className="bg-white p-12 text-center text-gray-400 space-y-2 rounded-sm">
      <div className="flex justify-center">{icon}</div>
      <div>{text}</div>
    </div>
  );
}

/* ============================== APP CHÍNH ============================== */

export default function App() {
  // Dữ liệu lõi
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [cart, setCart] = useState([]);
  const [wishlist, setWishlist] = useState([]);

  // Tài khoản / phân quyền
  const [users, setUsers] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState(null); // null = khách (guest)
  const [shops, setShops] = useState<any[]>([]);
  const [sellerApplications, setSellerApplications] = useState<any[]>([]);
  const [guestOrderIds, setGuestOrderIds] = useState([]); // đơn hàng đặt khi chưa đăng nhập, chỉ lưu trong phiên hiện tại
  const [authModal, setAuthModal] = useState(null); // null | 'login' | 'register' | 'apply'
  const [authForm, setAuthForm] = useState({ username: '', password: '', name: '', phone: '' });
  const [applyForm, setApplyForm] = useState({ shopName: '', phone: '', address: '', category: CATEGORIES[1] });
  const [profileDraft, setProfileDraft] = useState({ name: '', phone: '' });
  const [addressDraft, setAddressDraft] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null); // { title, message, confirmLabel, danger, onConfirm }

  // Điều hướng
  const [view, setView] = useState('buyer'); // buyer | seller
  const [buyerPage, setBuyerPage] = useState('home'); // home | product | cart | checkout | purchase | wishlist
  // overview | products | addProduct | orders | bulkShipping | handover | returns | reviews | finance | analytics | placeholder
  const [sellerPage, setSellerPage] = useState('overview');
  const [placeholderLabel, setPlaceholderLabel] = useState('');

  // Trang chủ / danh mục
  const [selectedCategory, setSelectedCategory] = useState('Tất cả');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [sortBy, setSortBy] = useState('popular');

  // Banner trang chủ (chỉnh sửa từ Kênh Người Bán > Trang Trí Shop)
  const [heroBanner, setHeroBanner] = useState({
    tag: 'ƯU ĐÃI TUẦN NÀY',
    title: 'SIÊU SALE PHỤ KIỆN CÔNG NGHỆ',
    subtitle: `Giảm đến 50% · Freeship cho đơn từ ${formatVND(FREE_SHIP_THRESHOLD)}`,
  });
  const [bannerDraft, setBannerDraft] = useState(heroBanner);

  // Chi tiết sản phẩm
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);

  // Giỏ hàng
  const [isCartHoverOpen, setIsCartHoverOpen] = useState(false);
  const [selectedCartIds, setSelectedCartIds] = useState([]);
  const [cartBump, setCartBump] = useState(false);
  const cartIconRef = useRef(null);
  const productImgRef = useRef(null);

  // Mua Ngay (bỏ qua giỏ hàng, đi thẳng tới Thanh Toán)
  const [buyNowItem, setBuyNowItem] = useState(null); // { productId, variant, qty }

  // Đơn mua (phía người mua)
  const [purchaseTab, setPurchaseTab] = useState('TatCa');
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [reviewOrderId, setReviewOrderId] = useState(null);
  const [reviewStars, setReviewStars] = useState(5);
  const [reviewComment, setReviewComment] = useState('');

  // Thanh toán
  const [checkoutInfo, setCheckoutInfo] = useState({ name: '', phone: '', address: '', payment: 'cod', note: '', voucher: '' });
  const [voucherMsg, setVoucherMsg] = useState('');

  // Người bán - đơn hàng
  const [sellerOrderTab, setSellerOrderTab] = useState('TatCa');
  const [sellerOrderSearchField, setSellerOrderSearchField] = useState('id');
  const [sellerOrderSearch, setSellerOrderSearch] = useState('');

  // Người bán - Giao Hàng Loạt
  const [pickupBatches, setPickupBatches] = useState([]);
  const [bulkSelectedIds, setBulkSelectedIds] = useState([]);
  const [bulkCarrierTab, setBulkCarrierTab] = useState('SPX Express');
  const [bulkOrderTypeTab, setBulkOrderTypeTab] = useState('thuong'); // thuong | hoatoc
  const [pickupDateChoice, setPickupDateChoice] = useState('');
  const dataReadyRef = useRef(false);

  // Người bán - Bàn Giao Đơn Hàng
  const [handoverMethodTab, setHandoverMethodTab] = useState('pickup'); // pickup | dropoff
  const [handoverStatusTab, setHandoverStatusTab] = useState('cho'); // cho | da

  // Người bán - Trả hàng/Hoàn tiền/Hủy
  const [returnsTab, setReturnsTab] = useState('TatCa'); // TatCa | TraHang | DonHuy
  const [returnsSearch, setReturnsSearch] = useState('');

  // Người bán - Chi tiết đơn hàng
  const [viewingOrderId, setViewingOrderId] = useState(null);
  const [orderDetailBackTo, setOrderDetailBackTo] = useState('orders');
  const [orderNotes, setOrderNotes] = useState({});
  const [noteDraft, setNoteDraft] = useState('');

  // Người bán - quản lý sản phẩm (trang Thêm/Sửa)
  const [editingProduct, setEditingProduct] = useState(null);
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const fileInputRef = useRef(null);

  // Thông báo
  const [toast, setToast] = useState('');
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  };

  /* ---------- Tài khoản / phân quyền ---------- */
  // Dữ liệu mới nhất của người dùng đang đăng nhập (currentUser chỉ giữ id/tham chiếu ban đầu)
  const myUser = currentUser ? (users.find((u) => u.id === currentUser.id) || currentUser) : null;
  const myShop = currentUser ? shops.find((s) => s.ownerId === currentUser.id) : null;
  // Admin quản lý TẤT CẢ shop trong hệ thống; seller chỉ quản lý shop của chính mình
  const managedShopIds = myUser?.role === 'admin' ? shops.map((s) => s.id) : (myShop ? [myShop.id] : []);
  const myPendingApplication = currentUser ? sellerApplications.find((a) => a.userId === currentUser.id && a.status === 'pending') : null;

  useEffect(() => {
    setProfileDraft({ name: myUser?.name || '', phone: myUser?.phone || '' });
  }, [currentUser?.id]);

  // Đồng bộ giỏ hàng & yêu thích vào tài khoản đang đăng nhập
  useEffect(() => {
    if (!currentUser) return;
    setUsers((prev) => prev.map((u) => (u.id === currentUser.id ? { ...u, cart, wishlist } : u)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, wishlist]);

  useEffect(() => {
    // Nếu view đang ở Kênh Người Bán mà người dùng không còn quyền (đăng xuất, bị đổi vai trò...) thì đưa về trang mua hàng
    if (view === 'seller' && !(myUser && (myUser.role === 'admin' || myUser.role === 'seller'))) {
      setView('buyer');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, myUser?.role]);

  useEffect(() => {
    let cancelled=false;
    (async()=>{ try { const d=await loadRemoteData(); if(cancelled)return; setProducts(d.products); setShops(d.shops); setOrders(d.orders); setSellerApplications(d.sellerApplications); dataReadyRef.current=true; const {data:{session}}=await supabase.auth.getSession(); if(session?.user){ const {data:profile}=await supabase.from('profiles').select('*').eq('id',session.user.id).single(); if(profile){ setUsers([profile]); setCurrentUser({...profile,id:profile.id,username:profile.username,name:profile.full_name,phone:profile.phone,role:profile.role}); const [{data:cs},{data:ws},{data:vs}]=await Promise.all([supabase.from('cart_items').select('*').eq('user_id',profile.id).order('sort_order'),supabase.from('wishlist_items').select('*').eq('user_id',profile.id).order('sort_order'),supabase.from('viewed_products').select('*').eq('user_id',profile.id).order('last_viewed_at',{ascending:false})]); setCart(cs||[]); setWishlist((ws||[]).map((x:any)=>x.product_id)); setSelectedCartIds((cs||[]).map((x:any)=>x.id||x.key)); setUsers([profile]); } } } catch(e){ console.error(e); } })();
    const ch=supabase.channel('kimshop-live').on('postgres_changes',{event:'*',schema:'public',table:'products'},()=>loadRemoteData().then(d=>{if(!cancelled){setProducts(d.products);setShops(d.shops);setOrders(d.orders);setSellerApplications(d.sellerApplications)}})).subscribe();
    return ()=>{cancelled=true; supabase.removeChannel(ch);};
  },[]);

  useEffect(()=>{
    if(!dataReadyRef.current || !currentUser?.id) return;
    const t=setTimeout(async()=>{
      const safeUsers=users.map((u:any)=>{const {password,...safe}=u; return safe;});
      const payload={users:safeUsers,cart,wishlist,viewedProducts:myUser?.viewedProducts||[],addresses:myUser?.addresses||[]};
      const {error}=await supabase.from('app_state').upsert({key:`user:${currentUser.id}`,user_id:currentUser.id,payload,updated_at:new Date().toISOString()},{onConflict:'key'});
      if(error) console.error('User sync failed',error);
    },500);
    return()=>clearTimeout(t);
  },[users,cart,wishlist,currentUser?.id,myUser?.viewedProducts,myUser?.addresses]);

  useEffect(()=>{
    if(!dataReadyRef.current) return;
    const t=setTimeout(async()=>{
      const payload={products,shops,orders,sellerApplications};
      const {error}=await supabase.from('app_state').upsert({key:'global:catalog',user_id:null,payload,updated_at:new Date().toISOString()},{onConflict:'key'});
      if(error) console.error('Catalog sync failed',error);
    },500);
    return()=>clearTimeout(t);
  },[products,shops,orders,sellerApplications]);

  useEffect(()=>{ if(!currentUser?.id)return; const t=setTimeout(async()=>{ await supabase.from('profiles').upsert({id:currentUser.id,username:currentUser.username,full_name:myUser?.name||currentUser.username,phone:myUser?.phone||'',role:myUser?.role||'buyer'},{onConflict:'id'}); },300); return()=>clearTimeout(t); },[myUser?.name,myUser?.phone,myUser?.role,currentUser?.id]);

  const openAuthModal = (mode) => {
    setAuthForm({ username: '', password: '', name: '', phone: '' });
    setAuthModal(mode);
  };

  const doLogin = async () => {
    const uname=authForm.username.trim().toLowerCase();
    if(!uname||!authForm.password){showToast('Vui lòng nhập tên đăng nhập và mật khẩu');return;}
    const email=uname.includes('@')?uname:`${uname}@kimshop.local`;
    const {data,error}=await supabase.auth.signInWithPassword({email,password:authForm.password});
    if(error||!data.user){showToast('Sai tên đăng nhập hoặc mật khẩu');return;}
    const {data:profile}=await supabase.from('profiles').select('*').eq('id',data.user.id).single();
    if(!profile){showToast('Không tìm thấy hồ sơ tài khoản');return;}
    const u={...profile,id:profile.id,username:profile.username,name:profile.full_name,phone:profile.phone,role:profile.role};
    setUsers([u]); setCurrentUser(u); setCart([]); setWishlist([]); setSelectedCartIds([]); setAuthModal(null); showToast(`Xin chào, ${u.name||u.username}!`);
  };

  const doRegister = async () => {
    const uname=authForm.username.trim().toLowerCase(); if(!uname||!authForm.password){showToast('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu');return;}
    const email=uname.includes('@')?uname:`${uname}@kimshop.local`;
    const {data,error}=await supabase.auth.signUp({email,password:authForm.password,options:{data:{username:uname,full_name:authForm.name.trim()||uname,phone:authForm.phone.trim()}}});
    if(error){showToast(error.message.includes('already')?'Tên đăng nhập đã tồn tại':error.message);return;}
    if(!data.user){showToast('Đăng ký thất bại');return;}
    const u={id:data.user.id,username:uname,name:authForm.name.trim()||uname,phone:authForm.phone.trim(),role:'buyer',addresses:[],wishlist:[],cart:[],viewedProducts:[]}; setUsers([u]); setCurrentUser(u); setCart([]);setWishlist([]);setSelectedCartIds([]);setAuthModal(null);showToast('Đăng ký tài khoản thành công!');
  };

  const doLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setCart([]); setWishlist([]); setSelectedCartIds([]);
    setUserMenuOpen(false);
    setView('buyer'); setBuyerPage('home');
    showToast('Đã đăng xuất');
  };

  const saveProfile = () => {
    if (!currentUser) return;
    setUsers((prev) => prev.map((u) => (u.id === currentUser.id ? { ...u, name: profileDraft.name.trim() || u.username, phone: profileDraft.phone.trim() } : u)));
    showToast('Đã cập nhật thông tin tài khoản');
  };

  const addAddress = () => {
    if (!currentUser) return;
    if (!addressDraft.trim()) { showToast('Vui lòng nhập địa chỉ'); return; }
    setUsers((prev) => prev.map((u) => (u.id === currentUser.id ? { ...u, addresses: [...(u.addresses || []), addressDraft.trim()] } : u)));
    setAddressDraft('');
    showToast('Đã thêm địa chỉ mới');
  };

  const removeAddress = (idx) => {
    if (!currentUser) return;
    setUsers((prev) => prev.map((u) => (u.id === currentUser.id ? { ...u, addresses: u.addresses.filter((_, i) => i !== idx) } : u)));
  };

  const useAddressForCheckout = (addr) => {
    setCheckoutInfo((prev) => ({ ...prev, address: addr, name: prev.name || myUser?.name || '', phone: prev.phone || myUser?.phone || '' }));
    showToast('Đã áp dụng địa chỉ cho đơn hàng');
  };

  const handleSellerChannelClick = () => {
    if (!currentUser) { openAuthModal('login'); return; }
    if (myUser.role === 'admin' || myUser.role === 'seller') { setView('seller'); return; }
    if (myPendingApplication) { showToast('Yêu cầu đăng ký shop của bạn đang chờ Admin duyệt'); return; }
    setApplyForm({ shopName: '', phone: myUser.phone || '', address: '', category: CATEGORIES[1] });
    setAuthModal('apply');
  };

  const submitApplication = () => {
    if (!applyForm.shopName.trim()) { showToast('Vui lòng nhập tên shop'); return; }
    const app = {
      id: 'app_' + Date.now(), userId: currentUser.id, username: currentUser.username,
      shopName: applyForm.shopName.trim(), phone: applyForm.phone.trim(), address: applyForm.address.trim(),
      category: applyForm.category, status: 'pending', createdAt: todayStr(),
    };
    setSellerApplications((prev) => [app, ...prev]);
    setAuthModal(null);
    showToast('Đã gửi yêu cầu đăng ký shop, vui lòng chờ Admin duyệt!');
  };

  const approveApplication = (appId) => {
    const app = sellerApplications.find((a) => a.id === appId);
    if (!app) return;
    const newShopId = 'shop_' + Date.now();
    setShops((prev) => [...prev, { id: newShopId, name: app.shopName, ownerId: app.userId, status: 'active' }]);
    setUsers((prev) => prev.map((u) => (u.id === app.userId ? { ...u, role: 'seller' } : u)));
    setSellerApplications((prev) => prev.map((a) => (a.id === appId ? { ...a, status: 'approved', shopId: newShopId } : a)));
    showToast(`Đã duyệt shop "${app.shopName}"`);
  };

  const rejectApplication = (appId) => {
    setSellerApplications((prev) => prev.map((a) => (a.id === appId ? { ...a, status: 'rejected' } : a)));
    showToast('Đã từ chối yêu cầu đăng ký shop');
  };

  const suspendShop = (shopId, shopName) => {
    setShops((prev) => prev.map((s) => (s.id === shopId ? { ...s, status: 'suspended' } : s)));
    showToast(`Đã đình chỉ shop "${shopName}", sản phẩm của shop sẽ tạm ẩn khỏi Trang Mua Hàng`);
    setConfirmDialog(null);
  };

  const reactivateShop = (shopId, shopName) => {
    setShops((prev) => prev.map((s) => (s.id === shopId ? { ...s, status: 'active' } : s)));
    showToast(`Đã mở lại hoạt động cho shop "${shopName}"`);
  };

  const terminateShop = (shopId, shopName, appId) => {
    const shop = shops.find((s) => s.id === shopId);
    setShops((prev) => prev.filter((s) => s.id !== shopId));
    if (shop) setUsers((prev) => prev.map((u) => (u.id === shop.ownerId ? { ...u, role: 'buyer' } : u)));
    setSellerApplications((prev) => prev.map((a) => (a.id === appId ? { ...a, status: 'revoked' } : a)));
    showToast(`Đã hủy quyền bán hàng của shop "${shopName}"`);
    setConfirmDialog(null);
  };

  const askConfirm = (opts) => setConfirmDialog(opts);

  /* ---------- Điều hướng sản phẩm ---------- */
  const openProduct = (product) => {
    setSelectedProductId(product.id);
    setSelectedVariant(product.variants[0]);
    setSelectedQty(1);
    setBuyerPage('product');
    window.scrollTo?.({ top: 0 });
    if (currentUser) {
      setUsers((prev) => prev.map((u) => (u.id === currentUser.id
        ? { ...u, viewedProducts: [product.id, ...((u.viewedProducts || []).filter((id) => id !== product.id))].slice(0, 20) }
        : u)));
    }
  };

  const selectedProduct = products.find((p) => p.id === selectedProductId) || null;

  /* ---------- Giỏ hàng ---------- */
  const addToCart = (product, variant, qty) => {
    const key = cartKey(product.id, variant);
    setCart((prev) => {
      const existing = prev.find((c) => c.key === key);
      if (existing) {
        return prev.map((c) => (c.key === key ? { ...c, qty: Math.min(c.qty + qty, product.stock) } : c));
      }
      return [...prev, { key, productId: product.id, variant, qty: Math.min(qty, product.stock) }];
    });
    setSelectedCartIds((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  const updateCartQty = (key, delta) => {
    setCart((prev) =>
      prev.map((c) => {
        if (c.key !== key) return c;
        const product = products.find((p) => p.id === c.productId);
        const max = product ? product.stock : 99;
        return { ...c, qty: Math.max(1, Math.min(c.qty + delta, max)) };
      })
    );
  };

  const removeCartItem = (key) => {
    setCart((prev) => prev.filter((c) => c.key !== key));
    setSelectedCartIds((prev) => prev.filter((k) => k !== key));
  };

  const toggleCartSelect = (key) => {
    setSelectedCartIds((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const cartItems = cart
    .map((c) => ({ ...c, product: products.find((p) => p.id === c.productId) }))
    .filter((c) => c.product);

  const groupedCart = cartItems.reduce((acc, item) => {
    const shop = item.product.shopName;
    if (!acc[shop]) acc[shop] = [];
    acc[shop].push(item);
    return acc;
  }, {});

  const allCartKeys = cartItems.map((c) => c.key);
  const allSelected = allCartKeys.length > 0 && allCartKeys.every((k) => selectedCartIds.includes(k));
  const toggleSelectAll = () => setSelectedCartIds(allSelected ? [] : allCartKeys);

  const toggleShopSelect = (shopItems) => {
    const keys = shopItems.map((i) => i.key);
    const allSel = keys.every((k) => selectedCartIds.includes(k));
    setSelectedCartIds((prev) => (allSel ? prev.filter((k) => !keys.includes(k)) : [...new Set([...prev, ...keys])]));
  };

  const selectedItems = cartItems.filter((c) => selectedCartIds.includes(c.key));
  const subtotal = selectedItems.reduce((s, c) => s + c.product.price * c.qty, 0);

  // Giỏ hàng thu nhỏ khi rê chuột vào icon giỏ hàng trên header
  const cartTotalQty = cartItems.reduce((s, c) => s + c.qty, 0);
  const cartPreviewItems = [...cartItems].slice(-5).reverse();
  const cartPreviewShownQty = cartPreviewItems.reduce((s, c) => s + c.qty, 0);
  const extraCartQty = Math.max(0, cartTotalQty - cartPreviewShownQty);

  const saveSelectedToWishlist = () => {
    if (selectedItems.length === 0) { showToast('Vui lòng chọn sản phẩm cần lưu'); return; }
    const ids = [...new Set(selectedItems.map((i) => i.product.id))];
    setWishlist((prev) => [...new Set([...prev, ...ids])]);
    const keysToRemove = selectedItems.map((i) => i.key);
    setCart((prev) => prev.filter((c) => !keysToRemove.includes(c.key)));
    setSelectedCartIds((prev) => prev.filter((k) => !keysToRemove.includes(k)));
    showToast('Đã lưu vào mục Đã thích');
  };

  const removeSelectedFromCart = () => {
    if (selectedItems.length === 0) { showToast('Vui lòng chọn sản phẩm cần xóa'); return; }
    const keysToRemove = selectedItems.map((i) => i.key);
    setCart((prev) => prev.filter((c) => !keysToRemove.includes(c.key)));
    setSelectedCartIds((prev) => prev.filter((k) => !keysToRemove.includes(k)));
    showToast('Đã xóa sản phẩm khỏi giỏ hàng');
  };

  // Bay hiệu ứng ảnh sản phẩm vào icon giỏ hàng
  const flyToCart = (imgEl) => {
    if (!imgEl || !cartIconRef.current) return;
    const startRect = imgEl.getBoundingClientRect();
    const endRect = cartIconRef.current.getBoundingClientRect();
    const flying = imgEl.cloneNode(true);
    Object.assign(flying.style, {
      position: 'fixed', left: `${startRect.left}px`, top: `${startRect.top}px`,
      width: `${startRect.width}px`, height: `${startRect.height}px`,
      borderRadius: '10px', zIndex: 9999, objectFit: 'cover', pointerEvents: 'none',
      transition: 'all 0.6s cubic-bezier(0.55,0,1,0.45)', boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
    });
    document.body.appendChild(flying);
    flying.getBoundingClientRect();
    requestAnimationFrame(() => {
      Object.assign(flying.style, {
        left: `${endRect.left + endRect.width / 2 - 10}px`,
        top: `${endRect.top + endRect.height / 2 - 10}px`,
        width: '20px', height: '20px', opacity: '0.3',
      });
    });
    setTimeout(() => {
      flying.remove();
      setCartBump(true);
      setTimeout(() => setCartBump(false), 300);
    }, 620);
  };

  // Danh sách sản phẩm dùng cho trang Thanh Toán: ưu tiên Mua Ngay, ngược lại lấy từ giỏ hàng đã chọn
  const checkoutItems = buyNowItem
    ? [{ key: cartKey(buyNowItem.productId, buyNowItem.variant), productId: buyNowItem.productId, variant: buyNowItem.variant, qty: buyNowItem.qty, product: products.find((p) => p.id === buyNowItem.productId) }].filter((c) => c.product)
    : selectedItems;
  const checkoutSubtotal = checkoutItems.reduce((s, c) => s + c.product.price * c.qty, 0);

  const voucher = (() => {
    const code = checkoutInfo.voucher.trim().toUpperCase();
    if (!code) return null;
    return VOUCHERS[code] || null;
  })();
  const discountAmount = voucher?.type === 'percent' ? Math.min(Math.round(checkoutSubtotal * voucher.value / 100), 50000)
    : voucher?.type === 'fixed' ? voucher.value : 0;
  const baseShipping = checkoutSubtotal === 0 ? 0 : (checkoutSubtotal >= FREE_SHIP_THRESHOLD ? 0 : SHIPPING_FEE);
  const finalShipping = voucher?.type === 'shipping' ? 0 : baseShipping;
  const finalTotal = Math.max(0, checkoutSubtotal - discountAmount + finalShipping);

  const applyVoucher = () => {
    const code = checkoutInfo.voucher.trim().toUpperCase();
    if (!code) { setVoucherMsg(''); return; }
    if (VOUCHERS[code]) setVoucherMsg(`Áp dụng thành công: ${VOUCHERS[code].label}`);
    else setVoucherMsg('Mã giảm giá không hợp lệ');
  };

  const updateCheckoutQty = (item, delta) => {
    const max = item.product ? item.product.stock : 99;
    if (buyNowItem) {
      setBuyNowItem((prev) => (prev ? { ...prev, qty: Math.max(1, Math.min(prev.qty + delta, max)) } : prev));
    } else {
      updateCartQty(item.key, delta);
    }
  };

  const goToCheckout = () => {
    if (selectedItems.length === 0) { showToast('Vui lòng chọn sản phẩm để thanh toán'); return; }
    setBuyNowItem(null);
    setBuyerPage('checkout');
    window.scrollTo?.({ top: 0 });
  };

  const placeOrder = () => {
    if (!checkoutInfo.name.trim() || !checkoutInfo.phone.trim() || !checkoutInfo.address.trim()) {
      showToast('Vui lòng nhập đầy đủ thông tin nhận hàng');
      return;
    }
    const groups = {};
    checkoutItems.forEach((item) => {
      const shop = item.product.shopName;
      if (!groups[shop]) groups[shop] = [];
      groups[shop].push(item);
    });
    const newOrders = Object.entries(groups).map(([shop, items]) => {
      const matchedShop = shops.find((s) => s.name === shop);
      return {
        id: 'DH' + Math.floor(100000 + Math.random() * 900000),
        shopName: shop,
        shopId: matchedShop ? matchedShop.id : null,
        customerUserId: currentUser ? currentUser.id : null,
        isPreferred: false,
        orderStatus: checkoutInfo.payment === 'cod' ? 'Chờ giao hàng' : 'Chờ thanh toán',
        paymentMethod: checkoutInfo.payment,
        createdAt: todayStr(),
        reviewed: false,
        customerName: checkoutInfo.name.trim(),
        customerPhone: checkoutInfo.phone.trim(),
        customerAddress: checkoutInfo.address.trim(),
        items: items.map((i) => ({
          productId: i.product.id, name: i.product.name, image: i.product.image,
          variant: i.variant, qty: i.qty, price: i.product.price, originalPrice: i.product.originalPrice,
        })),
        totalAmount: items.reduce((s, i) => s + i.product.price * i.qty, 0),
      };
    });
    setOrders((prev) => [...newOrders, ...prev]);
    if (!currentUser) setGuestOrderIds((prev) => [...newOrders.map((o) => o.id), ...prev]);
    setProducts((prev) => prev.map((p) => {
      const qtyOrdered = checkoutItems.filter((i) => i.product.id === p.id).reduce((s, i) => s + i.qty, 0);
      return qtyOrdered ? { ...p, stock: Math.max(0, p.stock - qtyOrdered), sold: p.sold + qtyOrdered } : p;
    }));
    if (buyNowItem) {
      setBuyNowItem(null);
    } else {
      const purchasedKeys = checkoutItems.map((i) => i.key);
      setCart((prev) => prev.filter((c) => !purchasedKeys.includes(c.key)));
      setSelectedCartIds((prev) => prev.filter((k) => !purchasedKeys.includes(k)));
    }
    setCheckoutInfo({ name: '', phone: '', address: '', payment: 'cod', note: '', voucher: '' });
    setVoucherMsg('');
    showToast('Đặt hàng thành công!');
    setBuyerPage('purchase');
  };

  /* ---------- Yêu thích ---------- */
  const toggleWishlist = (productId) => {
    setWishlist((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]));
  };

  /* ---------- Đơn mua (phía người mua) ---------- */
  const tabToStatus = {
    ChoThanhToan: 'Chờ thanh toán', VanChuyen: 'Vận chuyển', ChoGiaoHang: 'Chờ giao hàng',
    HoanThanh: 'Hoàn thành', DaHuy: 'Đã hủy', TraHang: 'Trả hàng/Hoàn tiền',
  };

  const myOrders = orders.filter((o) => (currentUser ? o.customerUserId === currentUser.id : guestOrderIds.includes(o.id)));

  const filteredOrders = myOrders.filter((ord) => {
    if (purchaseTab !== 'TatCa' && ord.orderStatus !== tabToStatus[purchaseTab]) return false;
    if (purchaseSearch.trim()) {
      const q = purchaseSearch.toLowerCase();
      return ord.shopName.toLowerCase().includes(q) || ord.id.toLowerCase().includes(q) ||
        ord.items.some((i) => i.name.toLowerCase().includes(q));
    }
    return true;
  });

  const payNow = (orderId) => setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, orderStatus: 'Chờ giao hàng' } : o)));
  const markReceived = (orderId) => setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, orderStatus: 'Hoàn thành', reviewDeadline: addDays(15) } : o)));
  const cancelOrder = (orderId) => setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, orderStatus: 'Đã hủy', cancelReason: o.cancelReason || 'Người mua yêu cầu hủy đơn' } : o)));
  const requestReturn = (orderId) => setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, orderStatus: 'Trả hàng/Hoàn tiền', returnReason: o.returnReason || 'Người mua không hài lòng với sản phẩm' } : o)));

  const openReview = (orderId) => { setReviewOrderId(orderId); setReviewStars(5); setReviewComment(''); };
  const submitReview = () => {
    const order = orders.find((o) => o.id === reviewOrderId);
    if (!order) return;
    setProducts((prev) => prev.map((p) => {
      const item = order.items.find((i) => i.productId === p.id);
      if (!item) return p;
      const newReviews = [...p.reviews, { id: Date.now() + Math.random(), user: 'Bạn', rating: reviewStars, comment: reviewComment || '(Không có nhận xét)', date: todayStr() }];
      const newRating = Math.round((newReviews.reduce((s, r) => s + r.rating, 0) / newReviews.length) * 10) / 10;
      return { ...p, reviews: newReviews, rating: newRating };
    }));
    setOrders((prev) => prev.map((o) => (o.id === reviewOrderId ? { ...o, reviewed: true } : o)));
    setReviewOrderId(null);
    showToast('Đánh giá của bạn đã được gửi!');
  };

  /* ---------- Người bán ---------- */
  const sellerProducts = products.filter((p) => p.shopId && managedShopIds.includes(p.shopId));
  const sellerOrders = orders.filter((o) => o.shopId && managedShopIds.includes(o.shopId));
  const totalRevenue = sellerOrders.filter((o) => o.orderStatus === 'Hoàn thành').reduce((s, o) => s + o.totalAmount, 0);
  const pendingOrders = sellerOrders.filter((o) => ['Chờ giao hàng', 'Vận chuyển', 'Chờ thanh toán'].includes(o.orderStatus)).length;
  const avgRating = sellerProducts.length
    ? Math.round((sellerProducts.reduce((s, p) => s + p.rating, 0) / sellerProducts.length) * 10) / 10
    : 0;
  const lowStock = sellerProducts.filter((p) => p.stock <= 5);
  const productRevenueData = sellerProducts.map((p) => ({ name: p.name.slice(0, 14) + '…', revenue: p.price * p.sold }));
  const sellerReviews = sellerProducts.flatMap((p) => p.reviews.map((r) => ({ ...r, productName: p.name, productImage: p.image, productId: p.id })))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const goSellerPage = (key) => { setSellerPage(key); window.scrollTo?.({ top: 0 }); };

  const openAddProduct = () => {
    if (myUser?.role === 'seller' && myShop?.status === 'suspended') {
      showToast('Shop của bạn đang bị đình chỉ, không thể thêm sản phẩm mới');
      return;
    }
    setEditingProduct({ id: null, name: '', category: 'Phụ Kiện Điện Thoại', price: '', originalPrice: '', stock: '', image: '', variants: '', description: '' });
    setShowAdvancedFields(false);
    goSellerPage('addProduct');
  };
  const openEditProduct = (p) => {
    setEditingProduct({ ...p, variants: p.variants.join(', ') });
    setShowAdvancedFields(true);
    goSellerPage('addProduct');
  };
  const handleImageFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Ảnh vượt quá dung lượng tối đa 2MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setEditingProduct((prev) => ({ ...prev, image: reader.result }));
    reader.readAsDataURL(file);
  };
  const saveProduct = () => {
    if (!editingProduct.name.trim() || !editingProduct.price) { showToast('Vui lòng nhập tên và giá sản phẩm'); return; }
    if (!editingProduct.image) { showToast('Vui lòng thêm hình ảnh sản phẩm'); return; }
    const variantsArr = editingProduct.variants.split(',').map((v) => v.trim()).filter(Boolean);
    if (editingProduct.id) {
      setProducts((prev) => prev.map((p) => (p.id === editingProduct.id ? {
        ...p, name: editingProduct.name, category: editingProduct.category,
        price: Number(editingProduct.price), originalPrice: Number(editingProduct.originalPrice) || Number(editingProduct.price),
        stock: Number(editingProduct.stock) || 0, image: editingProduct.image || p.image,
        variants: variantsArr.length ? variantsArr : p.variants, description: editingProduct.description,
      } : p)));
      showToast('Cập nhật sản phẩm thành công!');
    } else {
      const newId = Math.max(...products.map((p) => p.id)) + 1;
      const targetShopId = myShop ? myShop.id : DEFAULT_SHOP_ID;
      const targetShop = shops.find((s) => s.id === targetShopId);
      setProducts((prev) => [...prev, {
        id: newId, name: editingProduct.name, category: editingProduct.category,
        price: Number(editingProduct.price), originalPrice: Number(editingProduct.originalPrice) || Number(editingProduct.price),
        stock: Number(editingProduct.stock) || 0,
        image: editingProduct.image || 'https://images.unsplash.com/photo-1526406915894-7bcd65f60845?w=600&q=80',
        variants: variantsArr.length ? variantsArr : ['Mặc định'], description: editingProduct.description,
        shopId: targetShopId, shopName: targetShop ? targetShop.name : SELLER_SHOP, sellerOwned: true, rating: 5, sold: 0, reviews: [],
      }]);
      showToast('Đã thêm sản phẩm mới!');
    }
    setEditingProduct(null);
    goSellerPage('products');
  };
  const deleteProduct = (id) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    showToast('Đã xóa sản phẩm');
  };

  /* ---------- Trang Trí Shop (banner trang chủ) ---------- */
  const saveBanner = () => {
    if (!bannerDraft.title.trim()) { showToast('Vui lòng nhập tiêu đề banner'); return; }
    setHeroBanner(bannerDraft);
    showToast('Đã cập nhật banner trang chủ!');
  };

  /* ---------- Flash Sale Của Shop ---------- */
  const toggleFlashSale = (productId, checked) => {
    setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, flashSale: checked, flashPrice: checked ? (p.flashPrice || Math.round(p.price * 0.8)) : p.flashPrice } : p)));
  };
  const setFlashPrice = (productId, value) => {
    setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, flashPrice: value } : p)));
  };
  const updateSellerOrderStatus = (orderId, status) => setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, orderStatus: status } : o)));

  const sellerOrderCounts = SELLER_ORDER_TABS.reduce((acc, t) => {
    acc[t.key] = t.status ? sellerOrders.filter((o) => o.orderStatus === t.status).length : sellerOrders.length;
    return acc;
  }, {});

  const activeSellerTab = SELLER_ORDER_TABS.find((t) => t.key === sellerOrderTab);
  const filteredSellerOrders = sellerOrders.filter((o) => {
    if (activeSellerTab?.status && o.orderStatus !== activeSellerTab.status) return false;
    if (sellerOrderSearch.trim()) {
      const q = sellerOrderSearch.toLowerCase();
      if (sellerOrderSearchField === 'id') return o.id.toLowerCase().includes(q);
      if (sellerOrderSearchField === 'customer') return (o.customerName || '').toLowerCase().includes(q);
      if (sellerOrderSearchField === 'product') return o.items.some((i) => i.name.toLowerCase().includes(q));
    }
    return true;
  });

  /* ---------- Giao Hàng Loạt / Bàn Giao Đơn Hàng ---------- */
  // Đơn "Chờ giao hàng" và chưa nằm trong một phiếu chờ lấy hàng nào
  const bulkAvailableOrders = sellerOrders.filter((o) => o.orderStatus === 'Chờ giao hàng' && !o.pendingPickup);
  const bulkAllKeys = bulkAvailableOrders.map((o) => o.id);
  const bulkAllSelected = bulkAllKeys.length > 0 && bulkAllKeys.every((id) => bulkSelectedIds.includes(id));
  const toggleBulkSelect = (id) => setBulkSelectedIds((prev) => (prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]));
  const toggleBulkSelectAll = () => setBulkSelectedIds(bulkAllSelected ? [] : bulkAllKeys);

  const requestBulkPickup = (method) => {
    if (bulkSelectedIds.length === 0) { showToast('Vui lòng chọn ít nhất 1 kiện hàng'); return; }
    const batch = {
      id: 'PGH' + Math.floor(100000 + Math.random() * 900000),
      date: pickupDateChoice || todayStr(),
      method, // pickup | dropoff
      carrier: bulkCarrierTab,
      orderIds: [...bulkSelectedIds],
      status: 'cho_lay',
    };
    setPickupBatches((prev) => [batch, ...prev]);
    setOrders((prev) => prev.map((o) => (bulkSelectedIds.includes(o.id) ? { ...o, pendingPickup: true } : o)));
    setBulkSelectedIds([]);
    showToast(method === 'pickup' ? 'Đã gửi yêu cầu đơn vị vận chuyển đến lấy hàng!' : 'Đã tạo phiếu gửi hàng tại bưu cục!');
  };

  const confirmBatchPickedUp = (batchId) => {
    const batch = pickupBatches.find((b) => b.id === batchId);
    if (!batch) return;
    setPickupBatches((prev) => prev.map((b) => (b.id === batchId ? { ...b, status: 'da_lay' } : b)));
    setOrders((prev) => prev.map((o) => (batch.orderIds.includes(o.id) ? { ...o, orderStatus: 'Vận chuyển', pendingPickup: false } : o)));
    showToast('Đã xác nhận lấy hàng thành công!');
  };

  const handoverBatches = pickupBatches.filter((b) => b.method === handoverMethodTab);
  const handoverFiltered = handoverBatches.filter((b) => (handoverStatusTab === 'cho' ? b.status === 'cho_lay' : b.status === 'da_lay'));

  /* ---------- Trả hàng/Hoàn tiền/Đơn hủy ---------- */
  const returnsSourceOrders = sellerOrders.filter((o) => o.orderStatus === 'Đã hủy' || o.orderStatus === 'Trả hàng/Hoàn tiền');
  const returnsFiltered = returnsSourceOrders.filter((o) => {
    if (returnsTab === 'TraHang' && o.orderStatus !== 'Trả hàng/Hoàn tiền') return false;
    if (returnsTab === 'DonHuy' && o.orderStatus !== 'Đã hủy') return false;
    if (returnsSearch.trim()) {
      const q = returnsSearch.toLowerCase();
      return o.id.toLowerCase().includes(q) || (o.customerName || '').toLowerCase().includes(q) ||
        o.items.some((i) => i.name.toLowerCase().includes(q));
    }
    return true;
  });
  const returnsCounts = {
    TatCa: returnsSourceOrders.length,
    TraHang: returnsSourceOrders.filter((o) => o.orderStatus === 'Trả hàng/Hoàn tiền').length,
    DonHuy: returnsSourceOrders.filter((o) => o.orderStatus === 'Đã hủy').length,
  };
  const resolveReturn = (orderId) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, refundResolved: true } : o)));
    showToast('Đã xác nhận hoàn tất xử lý!');
  };

  /* ---------- Chi tiết đơn hàng (Người bán) ---------- */
  const openOrderDetail = (orderId, backTo = 'orders') => {
    setViewingOrderId(orderId);
    setOrderDetailBackTo(backTo);
    setNoteDraft(orderNotes[orderId] || '');
    goSellerPage('orderDetail');
  };
  const saveOrderNote = () => {
    setOrderNotes((prev) => ({ ...prev, [viewingOrderId]: noteDraft }));
    showToast('Đã lưu ghi chú');
  };
  const copyText = (label, value) => {
    if (!value) { showToast(`Không có ${label} để sao chép`); return; }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).then(() => showToast(`Đã sao chép ${label}`)).catch(() => showToast('Không thể sao chép'));
    } else {
      showToast('Trình duyệt không hỗ trợ sao chép');
    }
  };
  const orderStatusMeta = (o) => {
    if (o.orderStatus === 'Đã hủy') return { title: 'Đã hủy', lines: ['Đã hủy tự động bởi hệ thống Shopee Mini', `Lý do hủy: ${o.cancelReason || 'Người mua yêu cầu hủy đơn'}`] };
    if (o.orderStatus === 'Trả hàng/Hoàn tiền') return { title: 'Trả hàng/Hoàn tiền', lines: [`Lý do: ${o.returnReason || 'Người mua không hài lòng với sản phẩm'}`] };
    if (o.orderStatus === 'Hoàn thành') return { title: 'Hoàn thành', lines: ['Đơn hàng đã được giao thành công tới người mua'] };
    if (o.orderStatus === 'Vận chuyển') return { title: 'Đang vận chuyển', lines: ['Đơn vị vận chuyển đang giao hàng tới người mua'] };
    if (o.orderStatus === 'Chờ giao hàng') return { title: 'Chờ giao hàng', lines: [o.pendingPickup ? 'Đang chờ đơn vị vận chuyển đến lấy hàng' : 'Đơn hàng đang được chuẩn bị để giao'] };
    return { title: 'Chờ thanh toán', lines: ['Đang chờ người mua hoàn tất thanh toán'] };
  };
  const orderHistory = (o) => {
    const steps = [{ label: 'Đơn hàng mới', time: o.createdAt }];
    if (['Chờ giao hàng', 'Vận chuyển', 'Hoàn thành'].includes(o.orderStatus)) steps.push({ label: 'Chờ giao hàng', time: o.createdAt });
    if (['Vận chuyển', 'Hoàn thành'].includes(o.orderStatus)) steps.push({ label: 'Đang vận chuyển', time: o.createdAt });
    if (o.orderStatus === 'Hoàn thành') steps.push({ label: 'Đã giao hàng', time: o.reviewDeadline ? addDays(-15) : o.createdAt });
    if (o.orderStatus === 'Đã hủy') steps.push({ label: 'Đơn hàng đã hủy', time: o.createdAt });
    if (o.orderStatus === 'Trả hàng/Hoàn tiền') steps.push({ label: 'Yêu cầu trả hàng/hoàn tiền', time: o.createdAt });
    return steps.reverse();
  };

  /* ---------- Sản phẩm hiển thị trang chủ ---------- */
  // Sản phẩm thuộc shop trong hệ thống bị đình chỉ sẽ tạm ẩn khỏi trang mua hàng; shop ngoài (shopId null) luôn hiển thị
  const isShopActive = (shopId) => {
    if (!shopId) return true;
    const s = shops.find((x) => x.id === shopId);
    return !s || s.status !== 'suspended';
  };
  const visibleProducts = products.filter((p) => isShopActive(p.shopId));
  const flashSaleProducts = visibleProducts.filter((p) => p.flashSale && p.flashPrice);
  const filteredProducts = visibleProducts
    .filter((p) => selectedCategory === 'Tất cả' || p.category === selectedCategory)
    .filter((p) => !searchQuery.trim() || p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'popular') return b.sold - a.sold;
      if (sortBy === 'newest') return b.id - a.id;
      if (sortBy === 'priceAsc') return a.price - b.price;
      if (sortBy === 'priceDesc') return b.price - a.price;
      if (sortBy === 'rating') return b.rating - a.rating;
      return 0;
    });

  const runSearch = () => { setSearchQuery(searchDraft); setSelectedCategory('Tất cả'); setBuyerPage('home'); };

  const handleSellerMenuClick = (item) => {
    if (item.key === 'placeholder') { setPlaceholderLabel(item.label); goSellerPage('placeholder'); return; }
    if (item.key === 'addProduct') { openAddProduct(); return; }
    goSellerPage(item.key);
  };

  const isMenuItemActive = (item) => {
    if (item.key === 'placeholder') return sellerPage === 'placeholder' && placeholderLabel === item.label;
    if (item.key === 'addProduct') return sellerPage === 'addProduct' && !editingProduct?.id;
    return sellerPage === item.key;
  };

  /* ============================== GIAO DIỆN ============================== */

  return (
    <div className="min-h-screen bg-[#F5F5F5] font-sans text-xs text-[#333333] relative">
      {toast && (
        <div className="fixed top-4 right-4 z-[60] bg-gray-900 text-white px-4 py-2.5 rounded shadow-lg text-xs flex items-center gap-2">
          <Check size={14} /> <span>{toast}</span>
        </div>
      )}

      {/* MODAL XÁC NHẬN DÙNG CHUNG */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-3">
            <h3 className={`font-bold text-sm flex items-center gap-1.5 ${confirmDialog.danger ? 'text-rose-600' : 'text-gray-800'}`}>
              <AlertTriangle size={15} /> {confirmDialog.title}
            </h3>
            <p className="text-gray-600">{confirmDialog.message}</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-xs font-medium">Hủy</button>
              <button
                onClick={confirmDialog.onConfirm}
                className={`flex-1 text-white py-2 rounded-lg text-xs font-bold ${confirmDialog.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#EE4D2D] hover:bg-[#f63]'}`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {view === 'buyer' && (
        <div className="min-h-screen flex flex-col">
          {/* HEADER */}
          <header className="bg-gradient-to-b from-[#f53d2d] to-[#f63] text-white sticky top-0 z-40 shadow-sm">
            <div className="max-w-6xl mx-auto px-4 py-1.5 flex justify-between items-center text-[11px] border-b border-white/20">
              <div className="flex gap-4 items-center">
                <button onClick={handleSellerChannelClick} className="hover:opacity-75 transition-opacity flex items-center gap-1">
                  Kênh Người Bán
                  {myUser?.role === 'admin' && <ShieldCheck size={11} />}
                  {myPendingApplication && <span className="bg-amber-400 text-amber-900 text-[9px] font-bold px-1 rounded-sm">Chờ duyệt</span>}
                </button>
                <span className="text-white/40">|</span>
                <button onClick={() => { setBuyerPage('wishlist'); }} className="hover:opacity-75 transition-opacity flex items-center gap-1">
                  <Heart size={12} /> Yêu thích ({wishlist.length})
                </button>
              </div>
              <div className="flex gap-4 items-center">
                <span className="flex items-center gap-1 hover:opacity-75 transition-opacity cursor-pointer"><Bell size={12} /> Thông Báo</span>
                <span className="flex items-center gap-1 hover:opacity-75 transition-opacity cursor-pointer"><HelpCircle size={12} /> Hỗ Trợ</span>
                {!currentUser ? (
                  <div className="flex items-center gap-2">
                    <button onClick={() => openAuthModal('login')} className="flex items-center gap-1 hover:opacity-75 transition-opacity font-bold">
                      <LogIn size={12} /> Đăng Nhập
                    </button>
                    <span className="text-white/40">|</span>
                    <button onClick={() => openAuthModal('register')} className="flex items-center gap-1 hover:opacity-75 transition-opacity font-bold">
                      <UserPlus size={12} /> Đăng Ký
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <button onClick={() => setUserMenuOpen((s) => !s)} className="flex items-center gap-1.5 font-bold hover:opacity-75 transition-opacity">
                      <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">{(myUser?.name || myUser?.username || '?').charAt(0).toUpperCase()}</span>
                      {myUser?.username}
                      <ChevronDown size={11} />
                    </button>
                    {userMenuOpen && (
                      <div className="absolute right-0 top-full mt-2 w-44 bg-white text-[#333333] rounded-sm shadow-xl border border-gray-100 overflow-hidden z-50">
                        <button onClick={() => { setBuyerPage('account'); setUserMenuOpen(false); }} className="w-full text-left px-3.5 py-2.5 hover:bg-gray-50 flex items-center gap-2"><User size={12} /> Tài Khoản</button>
                        <button onClick={() => { setBuyerPage('purchase'); setUserMenuOpen(false); }} className="w-full text-left px-3.5 py-2.5 hover:bg-gray-50 flex items-center gap-2"><Package size={12} /> Đơn Mua</button>
                        <button onClick={doLogout} className="w-full text-left px-3.5 py-2.5 hover:bg-gray-50 flex items-center gap-2 text-rose-500"><LogOut size={12} /> Đăng Xuất</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between gap-6">
              <div onClick={() => { setBuyerPage('home'); setSelectedCategory('Tất cả'); }} className="cursor-pointer text-white select-none flex-shrink-0 flex items-center gap-3">
                <span className="text-3xl font-black tracking-tight drop-shadow-sm">Shopee Mini</span>
                {buyerPage === 'cart' && (
                  <span className="text-white/90 text-sm font-medium border-l border-white/30 pl-3 hidden sm:inline">Giỏ Hàng</span>
                )}
              </div>

              <div className="flex-1 max-w-2xl flex bg-white rounded-full p-1 shadow-md ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-white/70 transition-all">
                <input
                  type="text"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                  placeholder="Sạc nhanh, ốp lưng, micro livestream..."
                  className="w-full pl-4 pr-2 text-black text-xs outline-none rounded-full"
                />
                <button onClick={runSearch} className="bg-[#EE4D2D] hover:bg-[#f63] transition-colors text-white px-6 py-1.5 rounded-full font-bold flex-shrink-0">
                  <Search size={14} />
                </button>
              </div>

              <div
                ref={cartIconRef}
                className="relative cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
                onMouseEnter={() => setIsCartHoverOpen(true)}
                onMouseLeave={() => setIsCartHoverOpen(false)}
                onClick={() => { setBuyerPage('cart'); setIsCartHoverOpen(false); window.scrollTo?.({ top: 0 }); }}
              >
                <ShoppingCart size={26} className={`transition-transform duration-300 ${cartBump ? 'scale-125' : 'scale-100'}`} />
                {cartTotalQty > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-white text-[#f53d2d] font-bold text-[10px] w-4 h-4 flex items-center justify-center rounded-full shadow-sm">
                    {cartTotalQty > 99 ? '99+' : cartTotalQty}
                  </span>
                )}

                {isCartHoverOpen && (
                  <div className="absolute right-0 top-full pt-2 w-80 z-50">
                    <div className="bg-white text-[#333333] rounded-sm shadow-xl border border-gray-100 overflow-hidden">
                      {cartItems.length === 0 ? (
                        <div className="p-8 text-center text-gray-400 space-y-2">
                          <ShoppingCart size={30} className="mx-auto text-gray-300" />
                          <div>Chưa có sản phẩm trong giỏ hàng</div>
                        </div>
                      ) : (
                        <>
                          <div className="px-4 pt-3 pb-2 text-gray-400 text-[11px]">Sản Phẩm Mới Thêm</div>
                          <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                            {cartPreviewItems.map((item) => (
                              <div
                                key={item.key}
                                onClick={() => { openProduct(item.product); setIsCartHoverOpen(false); }}
                                className="flex items-center gap-2.5 px-4 py-2 hover:bg-gray-50 cursor-pointer"
                              >
                                <img src={item.product.image} className="w-9 h-9 object-cover rounded-sm border border-gray-100 flex-shrink-0" />
                                <div className="flex-1 line-clamp-1 text-gray-700 text-[11px]">{item.product.name}</div>
                                <div className="text-[#EE4D2D] font-medium text-[11px] flex-shrink-0">{formatVND(item.product.price)}</div>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-100">
                            <span className="text-gray-400 text-[11px] leading-tight">
                              {extraCartQty > 0 ? `${extraCartQty} Thêm Hàng Vào Giỏ` : `${cartTotalQty} Sản phẩm trong giỏ`}
                            </span>
                            <button
                              onClick={() => { setBuyerPage('cart'); setIsCartHoverOpen(false); window.scrollTo?.({ top: 0 }); }}
                              className="bg-[#EE4D2D] hover:bg-[#f63] transition-colors text-white text-[11px] font-bold px-4 py-1.5 rounded-sm flex-shrink-0"
                            >
                              Xem Giỏ Hàng
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* MENU */}
          <div className="bg-white border-b border-gray-200 shadow-sm">
            <div className="max-w-6xl mx-auto px-4 flex gap-7 text-sm font-medium py-2.5">
              <button onClick={() => setBuyerPage('home')} className={`pb-1.5 transition-colors border-b-2 ${buyerPage === 'home' || buyerPage === 'product' ? 'text-[#EE4D2D] border-[#EE4D2D]' : 'text-gray-600 border-transparent hover:text-[#EE4D2D]'}`}>
                Trang Chủ Mua Sắm
              </button>
              <button onClick={() => setBuyerPage('purchase')} className={`pb-1.5 flex items-center gap-1.5 transition-colors border-b-2 ${buyerPage === 'purchase' ? 'text-[#EE4D2D] border-[#EE4D2D]' : 'text-gray-600 border-transparent hover:text-[#EE4D2D]'}`}>
                <Package size={14} /> Đơn Mua của tôi
              </button>
              <button onClick={() => setBuyerPage('wishlist')} className={`pb-1.5 flex items-center gap-1.5 transition-colors border-b-2 ${buyerPage === 'wishlist' ? 'text-[#EE4D2D] border-[#EE4D2D]' : 'text-gray-600 border-transparent hover:text-[#EE4D2D]'}`}>
                <Heart size={14} /> Đã Thích
              </button>
              {currentUser && (
                <button onClick={() => setBuyerPage('account')} className={`pb-1.5 flex items-center gap-1.5 transition-colors border-b-2 ${buyerPage === 'account' ? 'text-[#EE4D2D] border-[#EE4D2D]' : 'text-gray-600 border-transparent hover:text-[#EE4D2D]'}`}>
                  <User size={14} /> Tài Khoản
                </button>
              )}
            </div>
          </div>

          {/* TRANG CHỦ */}
          {buyerPage === 'home' && (
            <main className="max-w-6xl mx-auto px-4 py-6 flex-1 space-y-4 w-full">
              <div className="relative overflow-hidden bg-gradient-to-r from-[#f53d2d] via-[#f5502f] to-[#ff8552] rounded-2xl p-7 text-white shadow-md">
                <div className="absolute -right-8 -top-10 w-44 h-44 rounded-full bg-white/10" />
                <div className="absolute right-16 bottom-[-40px] w-28 h-28 rounded-full bg-white/10" />
                <div className="relative">
                  {heroBanner.tag && <span className="inline-block bg-white/20 backdrop-blur-sm text-[10px] font-bold px-2.5 py-1 rounded-full mb-2 tracking-wide">{heroBanner.tag}</span>}
                  <h1 className="text-2xl font-black tracking-tight">{heroBanner.title}</h1>
                  {heroBanner.subtitle && <p className="text-[12px] opacity-90 mt-1.5">{heroBanner.subtitle}</p>}
                </div>
              </div>

              {flashSaleProducts.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3.5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex items-center gap-1 bg-[#EE4D2D] text-white font-black text-sm px-2.5 py-1 rounded-md"><Zap size={14} className="fill-white" /> FLASH SALE</span>
                    <span className="text-gray-400 text-[11px]">Số lượng có hạn, giá sốc mỗi ngày</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {flashSaleProducts.map((p) => {
                      const fDiscount = Math.round((1 - p.flashPrice / p.price) * 100);
                      return (
                        <div key={p.id} onClick={() => openProduct(p)} className="cursor-pointer border border-rose-100 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                          <div className="relative">
                            <img src={p.image} className="w-full h-24 object-cover" />
                            {fDiscount > 0 && <span className="absolute top-1 left-1 bg-[#EE4D2D] text-white text-[9px] font-bold px-1.5 py-0.5 rounded">-{fDiscount}%</span>}
                          </div>
                          <div className="p-2 space-y-0.5">
                            <div className="text-[10px] line-clamp-1 text-gray-700">{p.name}</div>
                            <div className="flex items-baseline gap-1">
                              <span className="text-[#EE4D2D] font-bold text-xs">{formatVND(p.flashPrice)}</span>
                              <span className="text-gray-300 line-through text-[9px]">{formatVND(p.price)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="bg-white p-3.5 rounded-xl border border-gray-100 shadow-sm flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setSelectedCategory(c)}
                    className={`px-3.5 py-1.5 rounded-full text-[11px] font-medium border transition-all ${selectedCategory === c ? 'bg-[#EE4D2D] text-white border-[#EE4D2D] shadow-sm shadow-orange-200' : 'bg-white text-gray-600 border-gray-200 hover:border-[#EE4D2D] hover:text-[#EE4D2D]'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
                <h3 className="font-bold text-sm text-gray-800 tracking-wide">
                  {searchQuery ? `Kết quả cho "${searchQuery}"` : 'GỢI Ý HÔM NAY'} <span className="text-gray-400 font-normal">({filteredProducts.length})</span>
                </h3>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="border border-gray-200 rounded-lg text-[11px] px-2.5 py-1.5 outline-none focus:border-[#EE4D2D] bg-white text-gray-600">
                  <option value="popular">Phổ biến</option>
                  <option value="newest">Mới nhất</option>
                  <option value="rating">Đánh giá cao</option>
                  <option value="priceAsc">Giá: Thấp đến Cao</option>
                  <option value="priceDesc">Giá: Cao đến Thấp</option>
                </select>
              </div>

              {filteredProducts.length === 0 ? (
                <EmptyState icon={<Search size={36} />} text="Không tìm thấy sản phẩm phù hợp" />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                  {filteredProducts.map((p) => {
                    const discount = Math.round((1 - p.price / p.originalPrice) * 100);
                    const liked = wishlist.includes(p.id);
                    return (
                      <div key={p.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group">
                        <div className="relative cursor-pointer overflow-hidden" onClick={() => openProduct(p)}>
                          <img src={p.image} alt={p.name} className="w-full h-36 object-cover group-hover:scale-105 transition-transform duration-300" />
                          {discount > 0 && (
                            <span className="absolute top-2 left-2 bg-[#EE4D2D] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-sm">-{discount}%</span>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleWishlist(p.id); }}
                            className="absolute top-2 right-2 bg-white/95 backdrop-blur-sm rounded-full p-1.5 shadow-sm hover:scale-110 transition-transform"
                          >
                            <Heart size={13} className={liked ? 'fill-[#EE4D2D] text-[#EE4D2D]' : 'text-gray-400'} />
                          </button>
                        </div>
                        <div className="p-2.5 space-y-1.5 cursor-pointer" onClick={() => openProduct(p)}>
                          <div className="text-[11px] line-clamp-2 leading-relaxed h-8 text-gray-700">{p.name}</div>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[#EE4D2D] font-bold text-sm">{formatVND(p.price)}</span>
                            {discount > 0 && <span className="text-gray-300 line-through text-[10px]">{formatVND(p.originalPrice)}</span>}
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-gray-400 pt-0.5">
                            <StarRating value={p.rating} size={10} />
                            <span>Đã bán {formatSold(p.sold)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </main>
          )}

          {/* CHI TIẾT SẢN PHẨM */}
          {buyerPage === 'product' && selectedProduct && !isShopActive(selectedProduct.shopId) && (
            <main className="max-w-6xl mx-auto px-4 py-5 flex-1 w-full space-y-4">
              <button onClick={() => setBuyerPage('home')} className="flex items-center gap-1 text-gray-500 hover:text-[#EE4D2D] transition-colors text-[11px] font-medium">
                <ChevronLeft size={14} /> Quay lại
              </button>
              <EmptyState icon={<AlertTriangle size={36} />} text="Sản phẩm này tạm thời không khả dụng vì shop đang bị đình chỉ hoạt động." />
            </main>
          )}

          {buyerPage === 'product' && selectedProduct && isShopActive(selectedProduct.shopId) && (
            <main className="max-w-6xl mx-auto px-4 py-5 flex-1 w-full space-y-4">
              <button onClick={() => setBuyerPage('home')} className="flex items-center gap-1 text-gray-500 hover:text-[#EE4D2D] transition-colors text-[11px] font-medium">
                <ChevronLeft size={14} /> Quay lại
              </button>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col md:flex-row gap-7">
                <div className="w-full md:w-72 flex-shrink-0">
                  <img ref={productImgRef} src={selectedProduct.image} alt={selectedProduct.name} className="w-full h-72 object-cover rounded-xl border border-gray-100 shadow-sm" />
                </div>
                <div className="flex-1 space-y-4">
                  <h1 className="text-lg font-semibold text-gray-800 leading-snug">{selectedProduct.name}</h1>
                  <div className="flex items-center gap-3 text-[11px] text-gray-500">
                    <StarRating value={selectedProduct.rating} showValue />
                    <span className="text-gray-300">|</span>
                    <span>{selectedProduct.reviews.length} Đánh Giá</span>
                    <span className="text-gray-300">|</span>
                    <span>Đã bán {formatSold(selectedProduct.sold)}</span>
                  </div>
                  <div className="bg-gradient-to-r from-[#FFF4F1] to-[#FFF9F7] rounded-xl p-4 flex items-center gap-3">
                    {selectedProduct.originalPrice > selectedProduct.price && (
                      <span className="text-gray-400 line-through text-xs">{formatVND(selectedProduct.originalPrice)}</span>
                    )}
                    <span className="text-[#EE4D2D] font-bold text-2xl tracking-tight">{formatVND(selectedProduct.price)}</span>
                    {selectedProduct.originalPrice > selectedProduct.price && (
                      <span className="bg-[#EE4D2D] text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                        -{Math.round((1 - selectedProduct.price / selectedProduct.originalPrice) * 100)}%
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="text-gray-500 text-[11px] mb-2 font-medium">Phân loại</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedProduct.variants.map((v) => (
                        <button
                          key={v}
                          onClick={() => setSelectedVariant(v)}
                          className={`px-3.5 py-1.5 border rounded-lg text-[11px] font-medium transition-all ${selectedVariant === v ? 'border-[#EE4D2D] text-[#EE4D2D] bg-[#FFF4F1] shadow-sm' : 'border-gray-200 text-gray-700 hover:border-gray-400'}`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 text-[11px] font-medium">Số lượng</span>
                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                      <button onClick={() => setSelectedQty((q) => Math.max(1, q - 1))} className="px-2.5 py-1.5 hover:bg-gray-50 transition-colors"><Minus size={12} /></button>
                      <span className="px-3.5 text-xs font-medium">{selectedQty}</span>
                      <button onClick={() => setSelectedQty((q) => Math.min(selectedProduct.stock, q + 1))} className="px-2.5 py-1.5 hover:bg-gray-50 transition-colors"><Plus size={12} /></button>
                    </div>
                    <span className="text-gray-400 text-[11px]">{selectedProduct.stock} sản phẩm có sẵn</span>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => { addToCart(selectedProduct, selectedVariant, selectedQty); showToast('Đã thêm vào giỏ hàng!'); flyToCart(productImgRef.current); }}
                      disabled={selectedProduct.stock === 0}
                      className="flex-1 border-2 border-[#EE4D2D] text-[#EE4D2D] py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-[#FFF4F1] transition-colors disabled:opacity-40 disabled:hover:bg-white"
                    >
                      <ShoppingCart size={14} /> Thêm Vào Giỏ Hàng
                    </button>
                    <button
                      onClick={() => { setBuyNowItem({ productId: selectedProduct.id, variant: selectedVariant, qty: selectedQty }); setBuyerPage('checkout'); window.scrollTo?.({ top: 0 }); }}
                      disabled={selectedProduct.stock === 0}
                      className="flex-1 bg-[#EE4D2D] text-white py-2.5 rounded-lg font-bold shadow-sm shadow-orange-200 hover:bg-[#f63] hover:shadow-md transition-all disabled:opacity-40 disabled:hover:shadow-sm"
                    >
                      {selectedProduct.stock === 0 ? 'Hết Hàng' : 'Mua Ngay'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full bg-[#EE4D2D]/10 text-[#EE4D2D] flex items-center justify-center flex-shrink-0"><Store size={16} /></span>
                  <span className="font-bold text-gray-800 text-sm">{selectedProduct.shopName}</span>
                </div>
                <div className="flex gap-2">
                  <button className="bg-[#EE4D2D] text-white px-3.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 hover:bg-[#f63] transition-colors"><MessageCircle size={12} /> Chat</button>
                  <button className="border border-gray-200 text-gray-600 px-3.5 py-1.5 rounded-lg text-[11px] hover:border-gray-400 transition-colors">Xem Shop</button>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-2.5">
                <h3 className="font-bold text-sm text-gray-800 tracking-wide">MÔ TẢ SẢN PHẨM</h3>
                <p className="text-gray-600 leading-relaxed">{selectedProduct.description}</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                <h3 className="font-bold text-sm text-gray-800 tracking-wide">ĐÁNH GIÁ SẢN PHẨM ({selectedProduct.reviews.length})</h3>
                {selectedProduct.reviews.length === 0 ? (
                  <p className="text-gray-400">Chưa có đánh giá nào cho sản phẩm này.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {selectedProduct.reviews.map((r) => (
                      <div key={r.id} className="py-3 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[9px] font-bold">{r.user.charAt(0).toUpperCase()}</span>
                          <span className="font-medium text-gray-700">{r.user}</span>
                          <StarRating value={r.rating} size={11} />
                          <span className="text-gray-400">{r.date}</span>
                        </div>
                        <p className="text-gray-600 pl-8">{r.comment}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </main>
          )}

          {/* YÊU THÍCH */}
          {buyerPage === 'wishlist' && (
            <main className="max-w-6xl mx-auto px-4 py-5 flex-1 w-full">
              <h2 className="font-bold text-sm text-gray-800 tracking-wide mb-3.5">SẢN PHẨM ĐÃ THÍCH ({wishlist.length})</h2>
              {wishlist.length === 0 ? (
                <EmptyState icon={<Heart size={36} />} text="Bạn chưa thích sản phẩm nào" />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                  {products.filter((p) => wishlist.includes(p.id) && isShopActive(p.shopId)).map((p) => (
                    <div key={p.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group">
                      <div className="relative cursor-pointer overflow-hidden" onClick={() => openProduct(p)}>
                        <img src={p.image} alt={p.name} className="w-full h-36 object-cover group-hover:scale-105 transition-transform duration-300" />
                        <button onClick={() => toggleWishlist(p.id)} className="absolute top-2 right-2 bg-white/95 backdrop-blur-sm rounded-full p-1.5 shadow-sm hover:scale-110 transition-transform">
                          <Heart size={13} className="fill-[#EE4D2D] text-[#EE4D2D]" />
                        </button>
                      </div>
                      <div className="p-2.5 space-y-1.5 cursor-pointer" onClick={() => openProduct(p)}>
                        <div className="text-[11px] line-clamp-2 h-8 text-gray-700">{p.name}</div>
                        <div className="text-[#EE4D2D] font-bold text-sm">{formatVND(p.price)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </main>
          )}

          {/* TÀI KHOẢN */}
          {buyerPage === 'account' && currentUser && (
            <main className="max-w-4xl mx-auto px-4 py-5 flex-1 w-full space-y-3.5">
              <h2 className="font-bold text-lg text-gray-800 flex items-center gap-2"><User size={18} className="text-[#EE4D2D]" /> Tài Khoản Của Tôi</h2>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                <h3 className="font-bold text-xs text-gray-700 tracking-wide">THÔNG TIN HỒ SƠ</h3>
                <div className="flex items-center gap-2 text-gray-500">
                  <Mail size={13} /> <span>Tên đăng nhập: <b className="text-gray-700">{myUser.username}</b></span>
                  {myUser.role !== 'buyer' && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-sm ${myUser.role === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                      {myUser.role === 'admin' ? 'ADMIN' : 'SELLER'}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="Họ và tên" value={profileDraft.name} onChange={(e) => setProfileDraft({ ...profileDraft, name: e.target.value })} className="border border-gray-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-[#EE4D2D]" />
                  <input placeholder="Số điện thoại" value={profileDraft.phone} onChange={(e) => setProfileDraft({ ...profileDraft, phone: e.target.value })} className="border border-gray-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-[#EE4D2D]" />
                </div>
                <button onClick={saveProfile} className="bg-[#EE4D2D] text-white px-5 py-2 rounded-lg font-bold text-xs hover:bg-[#f63] transition-colors">Lưu Thay Đổi</button>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                <h3 className="font-bold text-xs text-gray-700 tracking-wide flex items-center gap-1.5"><MapPin size={13} /> SỔ ĐỊA CHỈ</h3>
                {(myUser.addresses || []).length === 0 ? (
                  <p className="text-gray-400">Bạn chưa lưu địa chỉ nào.</p>
                ) : (
                  <div className="space-y-2">
                    {myUser.addresses.map((addr, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg px-3.5 py-2.5">
                        <span className="text-gray-700 flex-1">{addr}</span>
                        <button onClick={() => useAddressForCheckout(addr)} className="text-blue-600 hover:underline flex-shrink-0">Dùng khi thanh toán</button>
                        <button onClick={() => removeAddress(idx)} className="text-gray-400 hover:text-rose-500 flex-shrink-0"><Trash2 size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input placeholder="Thêm địa chỉ mới..." value={addressDraft} onChange={(e) => setAddressDraft(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-[#EE4D2D]" />
                  <button onClick={addAddress} className="bg-gray-100 hover:bg-gray-200 transition-colors px-4 rounded-lg font-medium text-gray-700">Thêm</button>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                <h3 className="font-bold text-xs text-gray-700 tracking-wide flex items-center gap-1.5"><Eye size={13} /> SẢN PHẨM ĐÃ XEM GẦN ĐÂY</h3>
                {(myUser.viewedProducts || []).length === 0 ? (
                  <p className="text-gray-400">Chưa có sản phẩm nào được xem gần đây.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {myUser.viewedProducts.map((pid) => {
                      const p = products.find((x) => x.id === pid);
                      if (!p) return null;
                      return (
                        <div key={pid} onClick={() => openProduct(p)} className="cursor-pointer border border-gray-100 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                          <img src={p.image} className="w-full h-20 object-cover" />
                          <div className="p-1.5 space-y-0.5">
                            <div className="text-[10px] line-clamp-1 text-gray-700">{p.name}</div>
                            <div className="text-[#EE4D2D] font-bold text-[11px]">{formatVND(p.price)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </main>
          )}

          {/* GIỎ HÀNG - TRANG ĐẦY ĐỦ */}
          {buyerPage === 'cart' && (
            <main className="max-w-6xl mx-auto px-4 py-5 w-full flex-1 pb-24">
              <div className="bg-white rounded-sm shadow-sm border border-gray-200">
                <div className="hidden md:flex items-center px-5 py-3.5 text-gray-400 text-[11px] border-b border-gray-200">
                  <label className="flex items-center gap-2.5 w-[42%] cursor-pointer">
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="accent-[#EE4D2D] w-3.5 h-3.5" />
                    Sản Phẩm
                  </label>
                  <div className="w-[15%] text-center">Đơn Giá</div>
                  <div className="w-[13%] text-center">Số Lượng</div>
                  <div className="w-[13%] text-center">Số Tiền</div>
                  <div className="w-[17%] text-center">Thao Tác</div>
                </div>

                {cartItems.length === 0 ? (
                  <EmptyState icon={<ShoppingCart size={36} />} text="Giỏ hàng của bạn còn trống" />
                ) : (
                  Object.entries(groupedCart).map(([shop, items]) => {
                    const shopSelected = items.every((i) => selectedCartIds.includes(i.key));
                    return (
                      <div key={shop} className="border-b border-gray-100 last:border-0">
                        <div className="flex items-center gap-2 px-5 py-3 text-gray-700">
                          <input type="checkbox" checked={shopSelected} onChange={() => toggleShopSelect(items)} className="accent-[#EE4D2D] w-3.5 h-3.5" />
                          <Store size={13} className="text-[#EE4D2D]" />
                          <span className="font-bold">{shop}</span>
                          <MessageCircle size={13} className="text-gray-400 hover:text-[#EE4D2D] cursor-pointer" />
                        </div>

                        {items.map((item) => (
                          <div key={item.key} className="flex flex-col md:flex-row md:items-center px-5 py-3 border-t border-gray-50 gap-3">
                            <div className="flex items-start gap-3 md:w-[42%]">
                              <input type="checkbox" checked={selectedCartIds.includes(item.key)} onChange={() => toggleCartSelect(item.key)} className="mt-1 accent-[#EE4D2D] w-3.5 h-3.5 flex-shrink-0" />
                              <img src={item.product.image} className="w-16 h-16 object-cover rounded-sm border border-gray-100 flex-shrink-0" />
                              <div className="space-y-1 min-w-0">
                                <div className="line-clamp-2 text-gray-700 cursor-pointer hover:text-[#EE4D2D]" onClick={() => openProduct(item.product)}>{item.product.name}</div>
                                <div className="text-gray-400 flex items-center gap-1">Phân Loại Hàng: {item.variant} <ChevronDown size={10} /></div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between md:justify-center md:w-[15%] text-gray-600">
                              <span className="md:hidden text-gray-400">Đơn giá</span>
                              {formatVND(item.product.price)}
                            </div>
                            <div className="flex items-center justify-between md:justify-center md:w-[13%]">
                              <span className="md:hidden text-gray-400">Số lượng</span>
                              <div className="flex items-center border border-gray-200 rounded-sm overflow-hidden">
                                <button onClick={() => updateCartQty(item.key, -1)} className="px-2 py-1 hover:bg-gray-50 transition-colors"><Minus size={11} /></button>
                                <span className="px-3">{item.qty}</span>
                                <button onClick={() => updateCartQty(item.key, 1)} className="px-2 py-1 hover:bg-gray-50 transition-colors"><Plus size={11} /></button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between md:justify-center md:w-[13%] text-[#EE4D2D] font-bold">
                              <span className="md:hidden text-gray-400 font-normal">Số tiền</span>
                              {formatVND(item.product.price * item.qty)}
                            </div>
                            <div className="flex md:flex-col items-center md:items-center justify-end md:justify-center gap-3 md:gap-1 md:w-[17%] text-[11px]">
                              <button onClick={() => removeCartItem(item.key)} className="text-gray-500 hover:text-[#EE4D2D] transition-colors">Xóa</button>
                              <button onClick={() => showToast('Tính năng đang được phát triển')} className="text-blue-500 hover:underline">Tìm sản phẩm tương tự</button>
                            </div>
                          </div>
                        ))}

                        <button onClick={() => showToast('Cửa hàng chưa có Voucher nào')} className="flex items-center gap-1.5 px-5 py-2.5 text-blue-500 hover:underline border-t border-gray-50 w-full text-left">
                          <Wallet size={12} /> Thêm Shop Voucher
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </main>
          )}

          {/* THANH GIỎ HÀNG CỐ ĐỊNH PHÍA DƯỚI */}
          {buyerPage === 'cart' && cartItems.length > 0 && (
            <div className="sticky bottom-0 z-30 bg-white border-t border-gray-200 shadow-[0_-4px_12px_-6px_rgba(0,0,0,0.1)]">
              <div className="max-w-6xl mx-auto px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4 text-gray-600">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="accent-[#EE4D2D] w-3.5 h-3.5" />
                    Chọn Tất Cả ({cartItems.length})
                  </label>
                  <button onClick={removeSelectedFromCart} className="hover:text-[#EE4D2D] transition-colors">Xóa</button>
                  <button onClick={saveSelectedToWishlist} className="hidden sm:inline hover:text-[#EE4D2D] transition-colors">Lưu vào mục Đã thích</button>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-gray-600">
                    Tổng cộng ({selectedItems.length} sản phẩm): <span className="text-[#EE4D2D] text-lg font-bold">{formatVND(subtotal)}</span>
                  </span>
                  <button onClick={goToCheckout} className="bg-[#EE4D2D] text-white px-8 py-2.5 rounded-sm font-bold hover:bg-[#f63] transition-colors shadow-sm shadow-orange-200">
                    Mua Hàng
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* THANH TOÁN */}
          {buyerPage === 'checkout' && (
            <main className="max-w-4xl mx-auto px-4 py-5 flex-1 w-full space-y-3.5">
              <h2 className="font-bold text-lg text-gray-800 flex items-center gap-2"><Truck size={18} className="text-[#EE4D2D]" /> Thanh Toán</h2>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                <h3 className="font-bold text-xs text-gray-700 tracking-wide">ĐỊA CHỈ NHẬN HÀNG</h3>
                {myUser && (myUser.addresses || []).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {myUser.addresses.map((addr, idx) => (
                      <button key={idx} onClick={() => useAddressForCheckout(addr)} className={`px-3 py-1.5 rounded-full border text-[11px] ${checkoutInfo.address === addr ? 'border-[#EE4D2D] text-[#EE4D2D] bg-[#FFF4F1]' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>
                        {addr.length > 32 ? addr.slice(0, 32) + '…' : addr}
                      </button>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="Họ và tên" value={checkoutInfo.name} onChange={(e) => setCheckoutInfo({ ...checkoutInfo, name: e.target.value })} className="border border-gray-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-[#EE4D2D] focus:ring-2 focus:ring-[#EE4D2D]/10 transition-all placeholder:text-gray-400" />
                  <input placeholder="Số điện thoại" value={checkoutInfo.phone} onChange={(e) => setCheckoutInfo({ ...checkoutInfo, phone: e.target.value })} className="border border-gray-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-[#EE4D2D] focus:ring-2 focus:ring-[#EE4D2D]/10 transition-all placeholder:text-gray-400" />
                </div>
                <input placeholder="Địa chỉ nhận hàng" value={checkoutInfo.address} onChange={(e) => setCheckoutInfo({ ...checkoutInfo, address: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-[#EE4D2D] focus:ring-2 focus:ring-[#EE4D2D]/10 transition-all placeholder:text-gray-400" />
                <textarea placeholder="Lời nhắn cho người bán (không bắt buộc)" value={checkoutInfo.note} onChange={(e) => setCheckoutInfo({ ...checkoutInfo, note: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-[#EE4D2D] focus:ring-2 focus:ring-[#EE4D2D]/10 transition-all placeholder:text-gray-400" rows={2} />
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                <h3 className="font-bold text-xs text-gray-700 tracking-wide">SẢN PHẨM ĐẶT MUA</h3>
                {Object.entries(checkoutItems.reduce((acc, i) => { (acc[i.product.shopName] = acc[i.product.shopName] || []).push(i); return acc; }, {})).map(([shop, items]) => (
                  <div key={shop} className="space-y-2.5 border-b border-dashed border-gray-200 pb-3.5 last:border-0 last:pb-0">
                    <div className="flex items-center gap-1.5 font-bold text-gray-700"><Store size={13} className="text-[#EE4D2D]" /> {shop}</div>
                    {items.map((i) => (
                      <div key={i.key} className="flex items-center gap-3">
                        <img src={i.product.image} className="w-12 h-12 object-cover rounded-lg border border-gray-100 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="line-clamp-1 text-gray-700">{i.product.name}</div>
                          <div className="text-gray-400">Phân loại: {i.variant}</div>
                          <div className="text-gray-500">{formatVND(i.product.price)}</div>
                        </div>
                        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                          <button onClick={() => updateCheckoutQty(i, -1)} className="px-2.5 py-1.5 hover:bg-gray-50 transition-colors"><Minus size={12} /></button>
                          <span className="px-3.5 min-w-[2.25rem] text-center font-bold text-gray-800">{i.qty}</span>
                          <button onClick={() => updateCheckoutQty(i, 1)} className="px-2.5 py-1.5 hover:bg-gray-50 transition-colors"><Plus size={12} /></button>
                        </div>
                        <div className="text-[#EE4D2D] font-bold w-24 text-right flex-shrink-0">{formatVND(i.product.price * i.qty)}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                <h3 className="font-bold text-xs text-gray-700 tracking-wide">MÃ GIẢM GIÁ</h3>
                <div className="flex gap-2">
                  <input placeholder="Nhập mã: FREESHIP, GIAM10, GIAM20K" value={checkoutInfo.voucher} onChange={(e) => setCheckoutInfo({ ...checkoutInfo, voucher: e.target.value })} className="flex-1 border border-gray-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-[#EE4D2D] focus:ring-2 focus:ring-[#EE4D2D]/10 transition-all placeholder:text-gray-400" />
                  <button onClick={applyVoucher} className="bg-gray-100 hover:bg-gray-200 transition-colors px-5 rounded-lg font-medium text-gray-700">Áp dụng</button>
                </div>
                {voucherMsg && <p className={voucher ? 'text-emerald-600' : 'text-rose-500'}>{voucherMsg}</p>}
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-2.5">
                <h3 className="font-bold text-xs text-gray-700 tracking-wide">PHƯƠNG THỨC THANH TOÁN</h3>
                <div className="flex items-center gap-2.5 border rounded-lg px-3.5 py-2.5 border-[#EE4D2D] bg-[#FFF4F1]">
                  <Truck size={14} className="text-[#EE4D2D]" />
                  <span className="text-gray-800 font-medium">Thanh toán khi nhận hàng (COD)</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-2">
                <div className="flex justify-between text-gray-600"><span>Tổng tiền hàng</span><span>{formatVND(checkoutSubtotal)}</span></div>
                <div className="flex justify-between text-gray-600"><span>Phí vận chuyển</span><span>{finalShipping === 0 ? 'Miễn phí' : formatVND(finalShipping)}</span></div>
                {discountAmount > 0 && <div className="flex justify-between text-emerald-600"><span>Giảm giá</span><span>-{formatVND(discountAmount)}</span></div>}
                <div className="flex justify-between text-sm font-bold border-t border-dashed border-gray-200 pt-2.5"><span>Tổng thanh toán</span><span className="text-[#EE4D2D] text-lg">{formatVND(finalTotal)}</span></div>
                <button onClick={placeOrder} className="w-full bg-[#EE4D2D] text-white py-3 rounded-xl font-bold mt-2 shadow-sm shadow-orange-200 hover:bg-[#f63] hover:shadow-md transition-all">Đặt Hàng</button>
              </div>
            </main>
          )}

          {/* ĐƠN MUA */}
          {buyerPage === 'purchase' && (
            <main className="max-w-6xl mx-auto px-4 py-5 w-full flex-1">
              <div className="bg-white rounded-sm shadow-sm border border-gray-200">
                <div className="flex border-b border-gray-200 text-xs overflow-x-auto">
                  {[
                    { key: 'TatCa', label: 'Tất cả' }, { key: 'ChoThanhToan', label: 'Chờ thanh toán' },
                    { key: 'VanChuyen', label: 'Vận chuyển' }, { key: 'ChoGiaoHang', label: 'Chờ giao hàng' },
                    { key: 'HoanThanh', label: 'Hoàn thành' }, { key: 'DaHuy', label: 'Đã hủy' }, { key: 'TraHang', label: 'Trả hàng/Hoàn tiền' },
                  ].map((t) => (
                    <button key={t.key} onClick={() => setPurchaseTab(t.key)} className={`flex-1 py-3.5 px-4 text-center font-medium whitespace-nowrap border-b-2 ${purchaseTab === t.key ? 'border-[#EE4D2D] text-[#EE4D2D]' : 'border-transparent text-gray-700 hover:text-[#EE4D2D]'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="p-3 bg-[#FAFAFA] border-b border-gray-200">
                  <div className="relative flex items-center">
                    <Search size={13} className="absolute left-3 text-gray-400" />
                    <input type="text" value={purchaseSearch} onChange={(e) => setPurchaseSearch(e.target.value)} placeholder="Tìm theo tên Shop, ID đơn hàng hoặc Tên sản phẩm" className="w-full pl-9 pr-4 py-2 text-xs border border-gray-200 rounded-sm bg-white outline-none focus:border-gray-400" />
                  </div>
                </div>

                <div className="space-y-3 p-3 bg-[#F5F5F5]">
                  {filteredOrders.length === 0 ? (
                    <EmptyState icon={<Package size={36} />} text="Chưa có đơn hàng nào" />
                  ) : (
                    filteredOrders.map((ord) => {
                      const canPay = ord.orderStatus === 'Chờ thanh toán';
                      const canCancel = ['Chờ thanh toán', 'Chờ giao hàng'].includes(ord.orderStatus);
                      const canReceive = ord.orderStatus === 'Chờ giao hàng';
                      const canReturn = ['Chờ giao hàng', 'Hoàn thành'].includes(ord.orderStatus);
                      const canReview = ord.orderStatus === 'Hoàn thành' && !ord.reviewed;
                      return (
                        <div key={ord.id} className="bg-white p-4 space-y-3 rounded-sm shadow-sm border border-gray-100">
                          <div className="flex justify-between items-center border-b pb-2.5 flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              {ord.isPreferred && <span className="bg-[#EE4D2D] text-white text-[9px] font-bold px-1 rounded-sm">Yêu thích</span>}
                              <span className="font-bold text-gray-800 text-xs flex items-center gap-1"><Store size={12} /> {ord.shopName}</span>
                              <span className="text-gray-400">#{ord.id}</span>
                              <button className="bg-[#EE4D2D] text-white px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1"><MessageCircle size={10} /> Chat</button>
                            </div>
                            <span className={`uppercase font-bold text-[11px] px-2 py-0.5 rounded-sm ${STATUS_STYLES[ord.orderStatus]}`}>{ord.orderStatus}</span>
                          </div>

                          {ord.items.map((it, idx) => (
                            <div key={idx} className="flex justify-between items-center py-1">
                              <div className="flex gap-3 items-center flex-1">
                                <img src={it.image} alt={it.name} className="w-16 h-16 object-cover border border-gray-200 rounded-sm" />
                                <div className="space-y-1">
                                  <h4 className="text-gray-800 text-xs line-clamp-2 leading-relaxed">{it.name}</h4>
                                  <p className="text-gray-400 text-[11px]">Phân loại: {it.variant} x{it.qty}</p>
                                </div>
                              </div>
                              <div className="text-right space-y-0.5">
                                <span className="text-gray-400 line-through text-[11px]">{formatVND(it.originalPrice)}</span>
                                <span className="text-[#EE4D2D] font-bold text-xs ml-2">{formatVND(it.price)}</span>
                              </div>
                            </div>
                          ))}

                          <div className="border-t border-dashed pt-3 flex justify-between items-center flex-wrap gap-2">
                            <span className="text-gray-500 text-[11px]">Ngày đặt: {ord.createdAt}{ord.reviewDeadline ? ` • Hạn đánh giá: ${ord.reviewDeadline}` : ''}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-600 text-xs">Thành tiền:</span>
                              <span className="text-[#EE4D2D] text-lg font-bold">{formatVND(ord.totalAmount)}</span>
                            </div>
                          </div>

                          <div className="pt-2 flex justify-end gap-2 flex-wrap">
                            {canPay && <button onClick={() => payNow(ord.id)} className="bg-[#EE4D2D] text-white px-4 py-2 rounded-sm font-bold text-xs">Thanh Toán Ngay</button>}
                            {canReceive && <button onClick={() => markReceived(ord.id)} className="bg-[#EE4D2D] text-white px-4 py-2 rounded-sm font-bold text-xs">Đã Nhận Hàng</button>}
                            {canReview && <button onClick={() => openReview(ord.id)} className="bg-[#EE4D2D] text-white px-4 py-2 rounded-sm font-bold text-xs">Đánh Giá</button>}
                            {ord.reviewed && <span className="text-emerald-600 px-2 py-2 text-[11px] flex items-center gap-1"><Check size={12} /> Đã đánh giá</span>}
                            {canReturn && <button onClick={() => requestReturn(ord.id)} className="border border-gray-300 text-gray-700 px-3 py-2 rounded-sm text-xs">Trả Hàng/Hoàn Tiền</button>}
                            {canCancel && <button onClick={() => cancelOrder(ord.id)} className="border border-gray-300 text-gray-700 px-3 py-2 rounded-sm text-xs">Hủy Đơn</button>}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </main>
          )}

          {/* FOOTER */}
          <footer className="bg-white border-t border-gray-200 mt-6 pt-8 pb-6">
            <div className="max-w-6xl mx-auto px-4 space-y-5 text-gray-500">
              <div className="flex flex-wrap gap-x-2 gap-y-1 justify-center text-gray-400 text-[11px]">
                <span>Chính Sách Bảo Mật</span><span className="text-gray-300">|</span>
                <span>Quy Chế Hoạt Động</span><span className="text-gray-300">|</span>
                <span>Chính Sách Vận Chuyển</span><span className="text-gray-300">|</span>
                <span>Chính Sách Trả Hàng Và Hoàn Tiền</span>
              </div>
              <div className="border-t border-gray-100 pt-5 text-center space-y-1.5">
                <p className="font-bold text-gray-700">Shopee Mini</p>
                <p>Chịu trách nhiệm nội dung: <b className="text-gray-700">Kim Văn Dũng</b> — Nhà Sáng Lập &amp; Giám Đốc Điều Hành</p>
                <p className="flex items-center justify-center gap-1.5 flex-wrap">
                  <span>Hotline: 0987198297</span>
                  <span className="text-gray-300">·</span>
                  <a href="https://www.facebook.com/profile.php?id=61557364233551" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Facebook</a>
                  <span className="text-gray-300">·</span>
                  <a href="https://zalo.me/g/eztxef598" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Nhóm Zalo 1</a>
                  <span className="text-gray-300">·</span>
                  <a href="https://zalo.me/g/ggoafk287" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Nhóm Zalo 2</a>
                </p>
                <p className="text-gray-400">© 2026 Shopee Mini. Tất cả các quyền được bảo lưu.</p>
              </div>
            </div>
          </footer>

          {/* MODAL ĐÁNH GIÁ */}
          {reviewOrderId && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-sm text-gray-800">Đánh Giá Sản Phẩm</h3>
                  <button onClick={() => setReviewOrderId(null)} className="text-gray-400 hover:text-gray-700 transition-colors"><X size={18} /></button>
                </div>
                <div className="flex items-center gap-1 justify-center py-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} onClick={() => setReviewStars(s)} className="hover:scale-110 transition-transform">
                      <Star size={28} className={s <= reviewStars ? 'fill-[#EE4D2D] text-[#EE4D2D]' : 'fill-gray-200 text-gray-200'} />
                    </button>
                  ))}
                </div>
                <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Chia sẻ cảm nhận của bạn về sản phẩm..." className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:border-[#EE4D2D] focus:ring-2 focus:ring-[#EE4D2D]/10 transition-all placeholder:text-gray-400" rows={3} />
                <button onClick={submitReview} className="w-full bg-[#EE4D2D] text-white py-2.5 rounded-xl font-bold shadow-sm shadow-orange-200 hover:bg-[#f63] hover:shadow-md transition-all">Gửi Đánh Giá</button>
              </div>
            </div>
          )}

          {/* MODAL ĐĂNG NHẬP */}
          {authModal === 'login' && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-sm text-gray-800 flex items-center gap-1.5"><LogIn size={15} className="text-[#EE4D2D]" /> Đăng Nhập</h3>
                  <button onClick={() => setAuthModal(null)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center border border-gray-200 rounded-lg px-3 focus-within:border-[#EE4D2D]">
                    <Mail size={13} className="text-gray-400 mr-2" />
                    <input placeholder="Tên đăng nhập" value={authForm.username} onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })} className="flex-1 py-2.5 outline-none" />
                  </div>
                  <div className="flex items-center border border-gray-200 rounded-lg px-3 focus-within:border-[#EE4D2D]">
                    <Lock size={13} className="text-gray-400 mr-2" />
                    <input type="password" placeholder="Mật khẩu" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && doLogin()} className="flex-1 py-2.5 outline-none" />
                  </div>
                </div>
                <button onClick={doLogin} className="w-full bg-[#EE4D2D] text-white py-2.5 rounded-xl font-bold hover:bg-[#f63] transition-colors">Đăng Nhập</button>
                <p className="text-center text-gray-500">
                  Chưa có tài khoản? <button onClick={() => openAuthModal('register')} className="text-blue-600 font-medium hover:underline">Đăng ký ngay</button>
                </p>
                <p className="text-center text-gray-300"></p>
              </div>
            </div>
          )}

          {/* MODAL ĐĂNG KÝ */}
          {authModal === 'register' && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-sm text-gray-800 flex items-center gap-1.5"><UserPlus size={15} className="text-[#EE4D2D]" /> Đăng Ký Tài Khoản</h3>
                  <button onClick={() => setAuthModal(null)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
                </div>
                <div className="space-y-2.5">
                  <input placeholder="Tên đăng nhập" value={authForm.username} onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-[#EE4D2D]" />
                  <input type="password" placeholder="Mật khẩu" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-[#EE4D2D]" />
                  <input placeholder="Họ và tên" value={authForm.name} onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-[#EE4D2D]" />
                  <input placeholder="Số điện thoại" value={authForm.phone} onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-[#EE4D2D]" />
                </div>
                <button onClick={doRegister} className="w-full bg-[#EE4D2D] text-white py-2.5 rounded-xl font-bold hover:bg-[#f63] transition-colors">Đăng Ký</button>
                <p className="text-center text-gray-500">
                  Đã có tài khoản? <button onClick={() => openAuthModal('login')} className="text-blue-600 font-medium hover:underline">Đăng nhập</button>
                </p>
              </div>
            </div>
          )}

          {/* MODAL ĐĂNG KÝ BÁN HÀNG (SHOP) */}
          {authModal === 'apply' && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-sm text-gray-800 flex items-center gap-1.5"><Store size={15} className="text-[#EE4D2D]" /> Đăng Ký Bán Hàng</h3>
                  <button onClick={() => setAuthModal(null)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
                </div>
                <p className="text-gray-500">Gửi yêu cầu mở shop, Admin sẽ xét duyệt trước khi shop của bạn được kích hoạt.</p>
                <div className="space-y-2.5">
                  <input placeholder="Tên shop" value={applyForm.shopName} onChange={(e) => setApplyForm({ ...applyForm, shopName: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-[#EE4D2D]" />
                  <input placeholder="Số điện thoại liên hệ" value={applyForm.phone} onChange={(e) => setApplyForm({ ...applyForm, phone: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-[#EE4D2D]" />
                  <input placeholder="Địa chỉ lấy hàng" value={applyForm.address} onChange={(e) => setApplyForm({ ...applyForm, address: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-[#EE4D2D]" />
                  <select value={applyForm.category} onChange={(e) => setApplyForm({ ...applyForm, category: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 outline-none">
                    {CATEGORIES.filter((c) => c !== 'Tất cả').map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <button onClick={submitApplication} className="w-full bg-[#EE4D2D] text-white py-2.5 rounded-xl font-bold hover:bg-[#f63] transition-colors">Gửi Yêu Cầu</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================== KÊNH NGƯỜI BÁN ============================== */}
      {view === 'seller' && (
        <div className="min-h-screen flex flex-col bg-[#F5F5F5]">
          {/* HEADER NGƯỜI BÁN */}
          <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
            <div className="px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="bg-[#EE4D2D] text-white text-lg font-black px-2 py-0.5 rounded-sm">Shopee Mini</span>
                <span className="text-gray-700 font-medium">Kênh Người Bán</span>
                <span className="text-gray-300">·</span>
                <span className="text-gray-500 flex items-center gap-1">
                  {myUser?.role === 'admin' ? <><ShieldCheck size={13} className="text-purple-500" /> Quản trị toàn bộ {shops.length} shop</> : <><Store size={13} className="text-[#EE4D2D]" /> {myShop?.name}</>}
                </span>
              </div>
              <div className="flex items-center gap-5 text-[11px]">
                <button onClick={() => setView('buyer')} className="text-blue-600 font-medium flex items-center gap-1 hover:underline">
                  <Store size={13} /> Xem Trang Mua Hàng
                </button>
                <span className="text-gray-300">|</span>
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#EE4D2D] text-white flex items-center justify-center font-bold text-[10px]">{(myUser?.name || myUser?.username || '?').charAt(0).toUpperCase()}</span>
                  <span className="text-gray-700 font-medium">{myUser?.username}</span>
                  {myUser?.role === 'admin' && <span className="bg-purple-100 text-purple-600 text-[9px] font-bold px-1.5 py-0.5 rounded-sm">ADMIN</span>}
                </div>
                <button onClick={() => { setView('buyer'); showToast('Đã rời Kênh Người Bán'); }} className="flex items-center gap-1 border border-gray-300 text-gray-600 px-3 py-1.5 rounded-sm hover:border-[#EE4D2D] hover:text-[#EE4D2D]">
                  <LogOut size={12} /> Đăng xuất
                </button>
              </div>
            </div>
          </header>

          <div className="flex flex-1">
            {/* SIDEBAR */}
            <aside className="w-64 bg-white border-r border-gray-200 flex-shrink-0">
              <button
                onClick={() => goSellerPage('overview')}
                className={`w-full flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 text-left font-bold ${sellerPage === 'overview' ? 'text-[#EE4D2D] bg-[#FFF4F1]' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                <LayoutDashboard size={15} /> Tổng Quan
              </button>
              <nav className="py-2">
                {SELLER_MENU.map((section) => (
                  <div key={section.group} className="px-5 py-2.5">
                    <div className="text-gray-800 font-bold text-[12px] mb-1.5">{section.group}</div>
                    <div className="space-y-0.5">
                      {section.items.map((item) => {
                        const active = isMenuItemActive(item);
                        return (
                          <button
                            key={item.label}
                            onClick={() => handleSellerMenuClick(item)}
                            className={`block w-full text-left px-2 py-1.5 rounded-sm text-[12px] ${active ? 'text-[#EE4D2D] font-bold bg-[#FFF4F1]' : 'text-gray-500 hover:text-gray-800'}`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {myUser?.role === 'admin' && (
                  <div className="px-5 py-2.5">
                    <div className="text-gray-800 font-bold text-[12px] mb-1.5">Quản Trị Hệ Thống</div>
                    <div className="space-y-0.5">
                      <button
                        onClick={() => goSellerPage('sellerApprovals')}
                        className={`w-full flex items-center justify-between text-left px-2 py-1.5 rounded-sm text-[12px] ${sellerPage === 'sellerApprovals' ? 'text-[#EE4D2D] font-bold bg-[#FFF4F1]' : 'text-gray-500 hover:text-gray-800'}`}
                      >
                        <span>Duyệt Đăng Ký Shop</span>
                        {sellerApplications.filter((a) => a.status === 'pending').length > 0 && (
                          <span className="bg-[#EE4D2D] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{sellerApplications.filter((a) => a.status === 'pending').length}</span>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </nav>
            </aside>

            <main className="flex-1 p-6 space-y-4 overflow-y-auto">
              {/* TỔNG QUAN */}
              {sellerPage === 'overview' && (
                <>
                  {myUser?.role === 'seller' && myShop?.status === 'suspended' && (
                    <div className="bg-rose-50 border border-rose-200 rounded-sm p-4 flex items-center gap-2 text-rose-600">
                      <AlertTriangle size={16} /> Shop của bạn đang <b>bị đình chỉ hoạt động</b> bởi Admin. Sản phẩm đã tạm ẩn khỏi Trang Mua Hàng, bạn không thể thêm sản phẩm mới cho đến khi được mở lại.
                    </div>
                  )}
                  <h2 className="font-bold text-base text-gray-800">Tổng Quan Cửa Hàng</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Doanh thu (đơn hoàn thành)', value: formatVND(totalRevenue) },
                      { label: 'Đơn hàng đang xử lý', value: pendingOrders },
                      { label: 'Sản phẩm đang bán', value: sellerProducts.length },
                      { label: 'Đánh giá trung bình', value: avgRating.toFixed(1) + ' ★' },
                    ].map((k) => (
                      <div key={k.label} className="bg-white rounded-sm border border-gray-200 p-4">
                        <div className="text-gray-400 text-[11px]">{k.label}</div>
                        <div className="text-lg font-bold text-gray-800 mt-1">{k.value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white rounded-sm border border-gray-200 p-4">
                    <h3 className="font-bold text-xs text-gray-700 mb-3">DOANH THU 7 NGÀY GẦN ĐÂY (dữ liệu minh hoạ)</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={REVENUE_TREND}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="day" fontSize={11} />
                        <YAxis fontSize={11} tickFormatter={(v) => (v / 1000) + 'k'} />
                        <Tooltip formatter={(v) => formatVND(v)} />
                        <Bar dataKey="revenue" fill={ORANGE} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {lowStock.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-sm p-4 space-y-2">
                      <h3 className="font-bold text-xs text-amber-700 flex items-center gap-2"><AlertTriangle size={14} /> Sản phẩm sắp hết hàng</h3>
                      {lowStock.map((p) => (
                        <div key={p.id} className="flex justify-between text-amber-700">
                          <span>{p.name}</span>
                          <span className="font-bold">Còn {p.stock}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* DUYỆT ĐĂNG KÝ SHOP (CHỈ ADMIN) */}
              {sellerPage === 'sellerApprovals' && myUser?.role === 'admin' && (
                <>
                  <h2 className="font-bold text-base text-gray-800">Duyệt Đăng Ký Shop</h2>
                  <div className="bg-white rounded-sm border border-gray-200 divide-y divide-gray-100">
                    {sellerApplications.length === 0 ? (
                      <div className="p-8 text-center text-gray-400">Chưa có yêu cầu đăng ký shop nào</div>
                    ) : (
                      sellerApplications.map((a) => {
                        const shop = a.shopId ? shops.find((s) => s.id === a.shopId) : null;
                        const isSuspended = shop?.status === 'suspended';
                        return (
                          <div key={a.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                            <div className="space-y-0.5">
                              <div className="font-bold text-gray-800 flex items-center gap-2 flex-wrap">
                                <Store size={13} className="text-[#EE4D2D]" /> {a.shopName}
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-sm ${a.status === 'pending' ? 'bg-amber-50 text-amber-600' : a.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : a.status === 'revoked' ? 'bg-rose-50 text-rose-600' : 'bg-gray-100 text-gray-500'}`}>
                                  {a.status === 'pending' ? 'Chờ duyệt' : a.status === 'approved' ? 'Đã duyệt' : a.status === 'revoked' ? 'Đã hủy quyền' : 'Đã từ chối'}
                                </span>
                                {a.status === 'approved' && shop && (
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-sm ${isSuspended ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>
                                    {isSuspended ? 'Đang bị đình chỉ' : 'Đang hoạt động'}
                                  </span>
                                )}
                              </div>
                              <div className="text-gray-500">Tài khoản: {a.username} · SĐT: {a.phone || '—'} · Ngành hàng: {a.category}</div>
                              <div className="text-gray-400">Địa chỉ: {a.address || '—'} · Ngày gửi: {a.createdAt}</div>
                            </div>
                            <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
                              {a.status === 'pending' && (
                                <>
                                  <button onClick={() => approveApplication(a.id)} className="bg-[#EE4D2D] text-white px-4 py-2 rounded-sm font-bold text-xs">Duyệt</button>
                                  <button onClick={() => rejectApplication(a.id)} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-sm text-xs">Từ chối</button>
                                </>
                              )}
                              {a.status === 'approved' && shop && !isSuspended && (
                                <>
                                  <button
                                    onClick={() => askConfirm({
                                      title: 'Đình chỉ shop?', danger: false, confirmLabel: 'Đình Chỉ',
                                      message: `Shop "${a.shopName}" sẽ tạm ẩn khỏi Trang Mua Hàng và không thể đăng bán thêm cho đến khi bạn mở lại.`,
                                      onConfirm: () => suspendShop(shop.id, a.shopName),
                                    })}
                                    className="border border-amber-300 text-amber-600 px-3 py-2 rounded-sm text-xs font-medium hover:bg-amber-50"
                                  >
                                    Đình Chỉ Shop
                                  </button>
                                  <button
                                    onClick={() => askConfirm({
                                      title: 'Hủy quyền bán hàng?', danger: true, confirmLabel: 'Hủy Quyền Shop',
                                      message: `Shop "${a.shopName}" sẽ bị xóa khỏi hệ thống, tài khoản chủ shop trở về vai trò người mua thường. Hành động này không thể hoàn tác.`,
                                      onConfirm: () => terminateShop(shop.id, a.shopName, a.id),
                                    })}
                                    className="border border-rose-300 text-rose-600 px-3 py-2 rounded-sm text-xs font-medium hover:bg-rose-50"
                                  >
                                    Hủy Quyền Shop
                                  </button>
                                </>
                              )}
                              {a.status === 'approved' && shop && isSuspended && (
                                <>
                                  <button onClick={() => reactivateShop(shop.id, a.shopName)} className="bg-[#EE4D2D] text-white px-3 py-2 rounded-sm font-bold text-xs">Mở Lại Hoạt Động</button>
                                  <button
                                    onClick={() => askConfirm({
                                      title: 'Hủy quyền bán hàng?', danger: true, confirmLabel: 'Hủy Quyền Shop',
                                      message: `Shop "${a.shopName}" sẽ bị xóa khỏi hệ thống, tài khoản chủ shop trở về vai trò người mua thường. Hành động này không thể hoàn tác.`,
                                      onConfirm: () => terminateShop(shop.id, a.shopName, a.id),
                                    })}
                                    className="border border-rose-300 text-rose-600 px-3 py-2 rounded-sm text-xs font-medium hover:bg-rose-50"
                                  >
                                    Hủy Quyền Shop
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}

              {/* TẤT CẢ SẢN PHẨM */}
              {sellerPage === 'products' && (
                <>
                  <div className="flex justify-between items-center">
                    <h2 className="font-bold text-base text-gray-800">Quản Lý Sản Phẩm</h2>
                    <button onClick={openAddProduct} className="bg-[#EE4D2D] text-white px-4 py-2 rounded-sm font-bold text-xs flex items-center gap-1"><Plus size={14} /> Thêm Sản Phẩm</button>
                  </div>
                  <div className="bg-white rounded-sm border border-gray-200 overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-gray-50 text-gray-500 text-[11px]">
                        <tr>
                          <th className="p-3">Sản phẩm</th>
                          {myUser?.role === 'admin' && <th className="p-3">Shop</th>}
                          <th className="p-3">Danh mục</th><th className="p-3">Giá</th>
                          <th className="p-3">Kho</th><th className="p-3">Đã bán</th><th className="p-3">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {sellerProducts.map((p) => (
                          <tr key={p.id}>
                            <td className="p-3 flex items-center gap-2"><img src={p.image} className="w-10 h-10 object-cover rounded-sm" /><span className="line-clamp-1 max-w-[220px]">{p.name}</span></td>
                            {myUser?.role === 'admin' && <td className="p-3 text-gray-500">{p.shopName}</td>}
                            <td className="p-3">{p.category}</td>
                            <td className="p-3 text-[#EE4D2D] font-bold">{formatVND(p.price)}</td>
                            <td className="p-3"><span className={p.stock <= 5 ? 'text-rose-500 font-bold' : ''}>{p.stock}</span></td>
                            <td className="p-3">{formatSold(p.sold)}</td>
                            <td className="p-3 flex gap-2">
                              <button onClick={() => openEditProduct(p)} className="text-blue-600"><Pencil size={14} /></button>
                              <button onClick={() => deleteProduct(p.id)} className="text-rose-500"><Trash2 size={14} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {sellerProducts.length === 0 && <div className="p-6 text-center text-gray-400">Chưa có sản phẩm nào</div>}
                  </div>
                </>
              )}

              {/* THÊM / SỬA SẢN PHẨM */}
              {sellerPage === 'addProduct' && editingProduct && (
                <div className="max-w-3xl space-y-3">
                  <button onClick={() => { setEditingProduct(null); goSellerPage('products'); }} className="flex items-center gap-1 text-gray-500 hover:text-[#EE4D2D] text-[11px]">
                    <ChevronLeft size={14} /> Quay lại
                  </button>
                  <div>
                    <h2 className="font-bold text-lg text-gray-800">{editingProduct.id ? 'Sửa Sản Phẩm' : 'Thêm Sản Phẩm Mới'}</h2>
                    <p className="text-gray-500 text-[11px] mt-0.5">Nhập thông tin sản phẩm để hiển thị trên cửa hàng của bạn.</p>
                  </div>

                  <div className="bg-white rounded-sm border border-gray-200 p-5 space-y-4">
                    <h3 className="font-bold text-sm text-gray-800">Thông tin cơ bản sản phẩm</h3>

                    <div>
                      <label className="block text-gray-600 text-[11px] mb-1.5">Hình ảnh sản phẩm <span className="text-[#EE4D2D]">*</span></label>
                      <div className="flex items-start gap-3">
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="relative w-24 h-24 flex-shrink-0 border-2 border-dashed border-gray-300 rounded-sm flex flex-col items-center justify-center gap-1 text-gray-400 cursor-pointer hover:border-[#EE4D2D] hover:text-[#EE4D2D] overflow-hidden"
                        >
                          {editingProduct.image ? (
                            <>
                              <img src={editingProduct.image} alt="Xem trước" className="w-full h-full object-cover" />
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingProduct({ ...editingProduct, image: '' }); }}
                                className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"
                              >
                                <X size={10} />
                              </button>
                            </>
                          ) : (
                            <>
                              <ImagePlus size={20} />
                              <span className="text-[9px] text-center leading-tight">Tải ảnh lên</span>
                            </>
                          )}
                        </div>
                        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" onChange={handleImageFile} className="hidden" />
                        <div className="flex-1 space-y-1">
                          <input
                            placeholder="Hoặc dán Link URL ảnh tại đây..."
                            value={editingProduct.image && editingProduct.image.startsWith('http') ? editingProduct.image : ''}
                            onChange={(e) => setEditingProduct({ ...editingProduct, image: e.target.value })}
                            className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]"
                          />
                          <p className="text-gray-400 text-[10px]">Hỗ trợ JPG, PNG. Kích thước đề xuất 800x800. Tối đa 2MB.</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-gray-600 text-[11px] mb-1.5">Tên sản phẩm <span className="text-[#EE4D2D]">*</span></label>
                      <input
                        placeholder="Nhập tên sản phẩm (ví dụ: Áo Sơ Mi Nam)"
                        value={editingProduct.name}
                        onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                        className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-gray-600 text-[11px] mb-1.5">Giá bán (VNĐ) <span className="text-[#EE4D2D]">*</span></label>
                        <input type="number" placeholder="0" value={editingProduct.price} onChange={(e) => setEditingProduct({ ...editingProduct, price: e.target.value })} className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]" />
                      </div>
                      <div>
                        <label className="block text-gray-600 text-[11px] mb-1.5">Kho hàng <span className="text-[#EE4D2D]">*</span></label>
                        <input type="number" placeholder="1" value={editingProduct.stock} onChange={(e) => setEditingProduct({ ...editingProduct, stock: e.target.value })} className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-gray-600 text-[11px] mb-1.5">Ngành hàng</label>
                      <select value={editingProduct.category} onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })} className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none">
                        {CATEGORIES.filter((c) => c !== 'Tất cả').map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <button onClick={() => setShowAdvancedFields((s) => !s)} className="flex items-center gap-1 text-blue-600 text-[11px] font-medium">
                      <ChevronDown size={13} className={`transition-transform ${showAdvancedFields ? 'rotate-180' : ''}`} />
                      {showAdvancedFields ? 'Ẩn thông tin nâng cao' : 'Thêm thông tin nâng cao (giá gốc, phân loại, mô tả)'}
                    </button>

                    {showAdvancedFields && (
                      <div className="space-y-3 border-t border-dashed pt-3">
                        <div>
                          <label className="block text-gray-600 text-[11px] mb-1.5">Giá gốc (VNĐ)</label>
                          <input type="number" placeholder="Để trống nếu không giảm giá" value={editingProduct.originalPrice} onChange={(e) => setEditingProduct({ ...editingProduct, originalPrice: e.target.value })} className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]" />
                        </div>
                        <div>
                          <label className="block text-gray-600 text-[11px] mb-1.5">Phân loại (cách nhau bằng dấu phẩy)</label>
                          <input placeholder="VD: Trắng, Đen, Xanh" value={editingProduct.variants} onChange={(e) => setEditingProduct({ ...editingProduct, variants: e.target.value })} className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]" />
                        </div>
                        <div>
                          <label className="block text-gray-600 text-[11px] mb-1.5">Mô tả sản phẩm</label>
                          <textarea placeholder="Mô tả chi tiết về sản phẩm..." value={editingProduct.description} onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })} className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]" rows={3} />
                        </div>
                      </div>
                    )}

                    <button onClick={saveProduct} className="w-full bg-[#EE4D2D] text-white py-2.5 rounded-sm font-bold flex items-center justify-center gap-2">
                      <Check size={15} /> Lưu &amp; Hiển Thị
                    </button>
                  </div>
                </div>
              )}

              {/* QUẢN LÝ ĐƠN HÀNG */}
              {sellerPage === 'orders' && (
                <div className="bg-white rounded-sm border border-gray-200">
                  <div className="flex border-b border-gray-200 text-xs overflow-x-auto">
                    {SELLER_ORDER_TABS.map((t) => (
                      <button
                        key={t.key}
                        onClick={() => setSellerOrderTab(t.key)}
                        className={`py-3.5 px-4 text-center font-medium whitespace-nowrap border-b-2 ${sellerOrderTab === t.key ? 'border-[#EE4D2D] text-[#EE4D2D]' : 'border-transparent text-gray-700 hover:text-[#EE4D2D]'}`}
                      >
                        {t.label} ({sellerOrderCounts[t.key]})
                      </button>
                    ))}
                  </div>

                  <div className="p-3 bg-[#FAFAFA] border-b border-gray-200 flex gap-2">
                    <select value={sellerOrderSearchField} onChange={(e) => setSellerOrderSearchField(e.target.value)} className="border border-gray-200 rounded-sm bg-white text-[11px] px-2 outline-none">
                      <option value="id">Mã đơn hàng</option>
                      <option value="customer">Tên khách hàng</option>
                      <option value="product">Tên sản phẩm</option>
                    </select>
                    <input
                      value={sellerOrderSearch}
                      onChange={(e) => setSellerOrderSearch(e.target.value)}
                      placeholder="Nhập thông tin tìm kiếm"
                      className="flex-1 border border-gray-200 rounded-sm px-3 py-2 text-xs bg-white outline-none focus:border-gray-400"
                    />
                    <button className="bg-[#EE4D2D] text-white px-5 rounded-sm font-bold text-xs">Tìm kiếm</button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-gray-50 text-gray-500 text-[11px]">
                        <tr>
                          <th className="p-3">Sản phẩm</th>
                          {myUser?.role === 'admin' && <th className="p-3">Shop</th>}
                          <th className="p-3">Tổng số tiền</th>
                          <th className="p-3">Trạng thái</th>
                          <th className="p-3">Ngày đặt</th>
                          <th className="p-3">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredSellerOrders.map((o) => (
                          <tr key={o.id} onClick={() => openOrderDetail(o.id, 'orders')} className="cursor-pointer hover:bg-[#FFF9F7] transition-colors">
                            <td className="p-3">
                              <div className="font-bold text-blue-600 hover:underline">{o.id}</div>
                              <div className="text-gray-500">{o.customerName}</div>
                              <div className="text-gray-400 text-[10px]">{o.items.length} sản phẩm</div>
                            </td>
                            {myUser?.role === 'admin' && <td className="p-3 text-gray-500">{o.shopName}</td>}
                            <td className="p-3 text-[#EE4D2D] font-bold">{formatVND(o.totalAmount)}</td>
                            <td className="p-3">
                              <span className={`inline-block font-bold text-[11px] px-2 py-0.5 rounded-sm ${STATUS_STYLES[o.orderStatus]}`}>{o.orderStatus}</span>
                            </td>
                            <td className="p-3 text-gray-500">{o.createdAt}</td>
                            <td className="p-3" onClick={(e) => e.stopPropagation()}>
                              <select value={o.orderStatus} onChange={(e) => updateSellerOrderStatus(o.id, e.target.value)} className={`rounded-sm px-2 py-1 text-[11px] border-0 ${STATUS_STYLES[o.orderStatus]}`}>
                                {ORDER_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredSellerOrders.length === 0 && <div className="p-8 text-center text-gray-400">Không có đơn hàng nào phù hợp</div>}
                  </div>
                </div>
              )}

              {/* QUẢN LÝ ĐÁNH GIÁ */}
              {sellerPage === 'reviews' && (
                <>
                  <h2 className="font-bold text-base text-gray-800">Quản Lý Đánh Giá</h2>
                  <div className="bg-white rounded-sm border border-gray-200 divide-y divide-gray-100">
                    {sellerReviews.length === 0 ? (
                      <div className="p-8 text-center text-gray-400">Chưa có đánh giá nào cho sản phẩm của bạn</div>
                    ) : (
                      sellerReviews.map((r) => (
                        <div key={r.id} className="p-4 flex gap-3">
                          <img src={r.productImage} className="w-12 h-12 object-cover rounded-sm border border-gray-100 flex-shrink-0" />
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-gray-700">{r.user}</span>
                              <StarRating value={r.rating} size={11} />
                              <span className="text-gray-400">{r.date}</span>
                            </div>
                            <p className="text-gray-800 line-clamp-1">{r.productName}</p>
                            <p className="text-gray-600">{r.comment}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}

              {/* TÀI CHÍNH / DOANH THU */}
              {sellerPage === 'finance' && (
                <>
                  <h2 className="font-bold text-base text-gray-800">Doanh Thu</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="bg-white rounded-sm border border-gray-200 p-4">
                      <div className="text-gray-400 text-[11px]">Tổng doanh thu (đơn hoàn thành)</div>
                      <div className="text-lg font-bold text-gray-800 mt-1">{formatVND(totalRevenue)}</div>
                    </div>
                    <div className="bg-white rounded-sm border border-gray-200 p-4">
                      <div className="text-gray-400 text-[11px]">Doanh thu dự kiến (đang xử lý)</div>
                      <div className="text-lg font-bold text-gray-800 mt-1">
                        {formatVND(sellerOrders.filter((o) => ['Chờ giao hàng', 'Vận chuyển', 'Chờ thanh toán'].includes(o.orderStatus)).reduce((s, o) => s + o.totalAmount, 0))}
                      </div>
                    </div>
                    <div className="bg-white rounded-sm border border-gray-200 p-4">
                      <div className="text-gray-400 text-[11px]">Số đơn hoàn thành</div>
                      <div className="text-lg font-bold text-gray-800 mt-1">{sellerOrders.filter((o) => o.orderStatus === 'Hoàn thành').length}</div>
                    </div>
                  </div>
                  <div className="bg-white rounded-sm border border-gray-200 p-4">
                    <h3 className="font-bold text-xs text-gray-700 mb-3">DOANH THU 7 NGÀY GẦN ĐÂY (dữ liệu minh hoạ)</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={REVENUE_TREND}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="day" fontSize={11} />
                        <YAxis fontSize={11} tickFormatter={(v) => (v / 1000) + 'k'} />
                        <Tooltip formatter={(v) => formatVND(v)} />
                        <Bar dataKey="revenue" fill={ORANGE} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="bg-white rounded-sm border border-gray-200 overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-gray-50 text-gray-500 text-[11px]">
                        <tr><th className="p-3">Mã đơn</th><th className="p-3">Khách hàng</th><th className="p-3">Ngày</th><th className="p-3">Số tiền</th></tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {sellerOrders.filter((o) => o.orderStatus === 'Hoàn thành').map((o) => (
                          <tr key={o.id}>
                            <td className="p-3">{o.id}</td>
                            <td className="p-3">{o.customerName}</td>
                            <td className="p-3 text-gray-500">{o.createdAt}</td>
                            <td className="p-3 text-[#EE4D2D] font-bold">{formatVND(o.totalAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* PHÂN TÍCH BÁN HÀNG */}
              {sellerPage === 'analytics' && (
                <>
                  <h2 className="font-bold text-base text-gray-800">Phân Tích Bán Hàng</h2>
                  <div className="bg-white rounded-sm border border-gray-200 p-4">
                    <h3 className="font-bold text-xs text-gray-700 mb-3">DOANH THU THEO SẢN PHẨM (giá x đã bán)</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={productRevenueData} layout="vertical" margin={{ left: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" fontSize={11} tickFormatter={(v) => (v / 1000000).toFixed(1) + 'tr'} />
                        <YAxis type="category" dataKey="name" fontSize={10} width={110} />
                        <Tooltip formatter={(v) => formatVND(v)} />
                        <Bar dataKey="revenue" fill={ORANGE} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="bg-white rounded-sm border border-gray-200 p-4">
                    <h3 className="font-bold text-xs text-gray-700 mb-3">XU HƯỚNG DOANH THU 7 NGÀY (dữ liệu minh hoạ)</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={REVENUE_TREND}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="day" fontSize={11} />
                        <YAxis fontSize={11} tickFormatter={(v) => (v / 1000) + 'k'} />
                        <Tooltip formatter={(v) => formatVND(v)} />
                        <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}

              {/* GIAO HÀNG LOẠT */}
              {sellerPage === 'bulkShipping' && (
                <div className="flex gap-4 items-start">
                  <div className="flex-1 bg-white rounded-sm border border-gray-200">
                    <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                      <h2 className="font-bold text-base text-gray-800">Giao Hàng Loạt</h2>
                      <span className="text-gray-400">{bulkAvailableOrders.length} kiện hàng chờ giao</span>
                    </div>
                    <div className="p-4 border-b border-gray-100 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-gray-500 w-28 flex-shrink-0">Loại Đơn hàng</span>
                        {[{ k: 'all', l: 'All' }, { k: 'thuong', l: `Đơn thường (${bulkAvailableOrders.length})` }, { k: 'hoatoc', l: 'Đơn Hoả Tốc (0)' }].map((o) => (
                          <button key={o.k} onClick={() => setBulkOrderTypeTab(o.k)} className={`px-3 py-1.5 rounded-full border text-[11px] ${bulkOrderTypeTab === o.k ? 'border-[#EE4D2D] text-[#EE4D2D] bg-[#FFF4F1]' : 'border-gray-200 text-gray-600'}`}>{o.l}</button>
                        ))}
                      </div>
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-gray-500 w-28 flex-shrink-0 pt-1.5">Đơn vị vận chuyển</span>
                        <div className="flex flex-wrap gap-2 flex-1">
                          {CARRIERS.map((c) => (
                            <button key={c} onClick={() => setBulkCarrierTab(c)} className={`px-3 py-1.5 rounded-full border text-[11px] ${bulkCarrierTab === c ? 'border-[#EE4D2D] text-[#EE4D2D] bg-[#FFF4F1]' : 'border-gray-200 text-gray-600'}`}>
                              {c} ({c === 'SPX Express' ? bulkAvailableOrders.length : 0})
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="p-3 flex items-center justify-between text-gray-500">
                      <span className="font-bold text-gray-700">{bulkAvailableOrders.length} Kiện hàng</span>
                      <span>Sắp xếp theo: Hạn gửi hàng (Xa - Gần nhất)</span>
                    </div>

                    {bulkCarrierTab !== 'SPX Express' || bulkAvailableOrders.length === 0 ? (
                      <EmptyState icon={<Package size={32} />} text="Không có dữ liệu" />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="bg-gray-50 text-gray-500 text-[11px]">
                            <tr>
                              <th className="p-3"><input type="checkbox" checked={bulkAllSelected} onChange={toggleBulkSelectAll} className="accent-[#EE4D2D]" /></th>
                              <th className="p-3">Sản Phẩm</th><th className="p-3">Mã đơn hàng</th><th className="p-3">Người mua</th>
                              <th className="p-3">Đơn vị vận chuyển</th><th className="p-3">Trạng thái Đơn hàng</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {bulkAvailableOrders.map((o) => (
                              <tr key={o.id}>
                                <td className="p-3"><input type="checkbox" checked={bulkSelectedIds.includes(o.id)} onChange={() => toggleBulkSelect(o.id)} className="accent-[#EE4D2D]" /></td>
                                <td className="p-3 flex items-center gap-2"><img src={o.items[0].image} className="w-10 h-10 object-cover rounded-sm" /><span className="line-clamp-1 max-w-[200px]">{o.items[0].name}</span></td>
                                <td className="p-3 font-bold text-gray-800">{o.id}</td>
                                <td className="p-3 text-gray-600">{o.customerName}</td>
                                <td className="p-3 text-gray-600">SPX Express</td>
                                <td className="p-3"><span className={`font-bold text-[11px] px-2 py-0.5 rounded-sm ${STATUS_STYLES[o.orderStatus]}`}>{o.orderStatus}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="w-80 flex-shrink-0 bg-white rounded-sm border border-gray-200 p-4 space-y-4 sticky top-4">
                    <h3 className="font-bold text-sm text-gray-800">Chuẩn bị đơn hàng loạt</h3>
                    <p className="text-gray-500">{bulkSelectedIds.length} parcels selected</p>
                    <div className="flex border-b border-gray-100">
                      <button className="flex-1 py-2 text-center font-medium border-b-2 border-[#EE4D2D] text-[#EE4D2D]">Pickup</button>
                      <button className="flex-1 py-2 text-center font-medium text-gray-400">Drop off</button>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">Địa chỉ lấy hàng</span>
                        <button className="text-blue-600">Đổi</button>
                      </div>
                      <p className="text-gray-700 leading-relaxed">{SELLER_USERNAME}<br />Địa chỉ lấy hàng của Shop (có thể chỉnh trong Cài Đặt Vận Chuyển)</p>
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1">Ngày lấy hàng</label>
                      <select value={pickupDateChoice} onChange={(e) => setPickupDateChoice(e.target.value)} className="w-full border border-gray-200 rounded-sm px-2 py-2 outline-none">
                        <option value="">Chọn ngày</option>
                        <option value={todayStr()}>Hôm nay ({todayStr()})</option>
                        <option value={addDays(1)}>Ngày mai ({addDays(1)})</option>
                      </select>
                    </div>
                    <button onClick={() => requestBulkPickup('pickup')} className="w-full bg-[#EE4D2D] text-white py-2.5 rounded-sm font-bold hover:bg-[#f63] transition-colors">
                      Yêu Cầu Đơn Vị Vận Chuyển Đến Lấy Hàng
                    </button>
                    <div className="border-t border-dashed pt-3 space-y-2">
                      <h4 className="font-bold text-gray-700">Drop off</h4>
                      <p className="text-gray-500">Bưu cục gần bạn nhất: Điểm dịch vụ SPX gần nhất (xem trên bản đồ)</p>
                      <button onClick={() => requestBulkPickup('dropoff')} className="w-full bg-[#EE4D2D] text-white py-2.5 rounded-sm font-bold hover:bg-[#f63] transition-colors">
                        Gửi Hàng Tại Bưu Cục
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* BÀN GIAO ĐƠN HÀNG */}
              {sellerPage === 'handover' && (
                <div className="bg-white rounded-sm border border-gray-200">
                  <div className="p-4 border-b border-gray-100">
                    <h2 className="font-bold text-base text-gray-800">Bàn Giao Đơn Hàng</h2>
                  </div>
                  <div className="flex border-b border-gray-200 text-xs">
                    <button onClick={() => setHandoverMethodTab('pickup')} className={`py-3 px-5 font-medium border-b-2 ${handoverMethodTab === 'pickup' ? 'border-[#EE4D2D] text-[#EE4D2D]' : 'border-transparent text-gray-600'}`}>Lấy hàng</button>
                    <button onClick={() => setHandoverMethodTab('dropoff')} className={`py-3 px-5 font-medium border-b-2 ${handoverMethodTab === 'dropoff' ? 'border-[#EE4D2D] text-[#EE4D2D]' : 'border-transparent text-gray-600'}`}>Gửi hàng tại bưu cục</button>
                  </div>
                  <div className="flex border-b border-gray-100 text-xs px-4 pt-3 gap-2">
                    <button onClick={() => setHandoverStatusTab('cho')} className={`px-3 py-1.5 rounded-full font-medium ${handoverStatusTab === 'cho' ? 'bg-[#FFF4F1] text-[#EE4D2D]' : 'text-gray-500'}`}>Chờ lấy hàng</button>
                    <button onClick={() => setHandoverStatusTab('da')} className={`px-3 py-1.5 rounded-full font-medium ${handoverStatusTab === 'da' ? 'bg-[#FFF4F1] text-[#EE4D2D]' : 'text-gray-500'}`}>Đã Lấy hàng</button>
                  </div>

                  {handoverFiltered.length === 0 ? (
                    <EmptyState icon={<Truck size={32} />} text="Không tìm thấy đơn hàng" />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-gray-50 text-gray-500 text-[11px]">
                          <tr>
                            <th className="p-3">Ngày Lấy hàng</th><th className="p-3">Đơn vị vận chuyển</th>
                            <th className="p-3">Đơn lấy dự kiến</th><th className="p-3">Lấy hàng thành công</th>
                            <th className="p-3">Số đơn chờ lấy hàng</th><th className="p-3">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {handoverFiltered.map((b) => (
                            <tr key={b.id}>
                              <td className="p-3">{b.date}</td>
                              <td className="p-3">{b.carrier}</td>
                              <td className="p-3">{b.orderIds.length}</td>
                              <td className="p-3">{b.status === 'da_lay' ? b.orderIds.length : 0}</td>
                              <td className="p-3">{b.status === 'cho_lay' ? b.orderIds.length : 0}</td>
                              <td className="p-3">
                                {b.status === 'cho_lay' ? (
                                  <button onClick={() => confirmBatchPickedUp(b.id)} className="bg-[#EE4D2D] text-white px-3 py-1.5 rounded-sm font-bold text-[11px]">Xác Nhận Đã Lấy Hàng</button>
                                ) : (
                                  <span className="text-emerald-600 flex items-center gap-1"><Check size={12} /> Hoàn tất</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ĐƠN TRẢ HÀNG/HOÀN TIỀN HOẶC ĐƠN HỦY */}
              {sellerPage === 'returns' && (
                <div className="bg-white rounded-sm border border-gray-200">
                  <div className="p-4 border-b border-gray-100">
                    <h2 className="font-bold text-base text-gray-800">Đơn Trả hàng/Hoàn tiền hoặc Đơn hủy</h2>
                  </div>
                  <div className="flex border-b border-gray-200 text-xs overflow-x-auto">
                    {[{ k: 'TatCa', l: 'Tất cả' }, { k: 'TraHang', l: 'Trả hàng/Hoàn tiền' }, { k: 'DonHuy', l: 'Đơn Hủy' }].map((t) => (
                      <button key={t.k} onClick={() => setReturnsTab(t.k)} className={`py-3.5 px-4 font-medium whitespace-nowrap border-b-2 ${returnsTab === t.k ? 'border-[#EE4D2D] text-[#EE4D2D]' : 'border-transparent text-gray-700 hover:text-[#EE4D2D]'}`}>
                        {t.l} ({returnsCounts[t.k]})
                      </button>
                    ))}
                  </div>
                  <div className="p-3 bg-[#FAFAFA] border-b border-gray-200">
                    <div className="relative flex items-center">
                      <Search size={13} className="absolute left-3 text-gray-400" />
                      <input value={returnsSearch} onChange={(e) => setReturnsSearch(e.target.value)} placeholder="Tìm theo Mã đơn hàng, Tên khách hàng hoặc Tên sản phẩm" className="w-full pl-9 pr-4 py-2 text-xs border border-gray-200 rounded-sm bg-white outline-none focus:border-gray-400" />
                    </div>
                  </div>

                  <div className="space-y-3 p-3 bg-[#F5F5F5]">
                    {returnsFiltered.length === 0 ? (
                      <EmptyState icon={<RotateCcw size={32} />} text="Không có yêu cầu nào" />
                    ) : (
                      returnsFiltered.map((o) => (
                        <div key={o.id} onClick={() => openOrderDetail(o.id, 'returns')} className="bg-white p-4 space-y-3 rounded-sm shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow">
                          <div className="flex justify-between items-center border-b pb-2.5 flex-wrap gap-2">
                            <span className="font-bold text-blue-600 hover:underline flex items-center gap-2">#{o.id} <span className="text-gray-400 font-normal">· {o.customerName}</span></span>
                            <span className={`uppercase font-bold text-[11px] px-2 py-0.5 rounded-sm ${STATUS_STYLES[o.orderStatus]}`}>{o.orderStatus}</span>
                          </div>
                          {o.items.map((it, idx) => (
                            <div key={idx} className="flex items-center gap-3">
                              <img src={it.image} className="w-14 h-14 object-cover rounded-sm border border-gray-200" />
                              <div className="flex-1">
                                <div className="text-gray-800 line-clamp-1">{it.name}</div>
                                <div className="text-gray-400">Phân loại: {it.variant} x{it.qty}</div>
                              </div>
                              <span className="text-[#EE4D2D] font-bold">{formatVND(it.price * it.qty)}</span>
                            </div>
                          ))}
                          <div className="border-t border-dashed pt-3 grid grid-cols-2 gap-2 text-gray-600">
                            <div><span className="text-gray-400">Lý do: </span>{o.orderStatus === 'Đã hủy' ? (o.cancelReason || 'Người mua yêu cầu hủy đơn') : (o.returnReason || 'Người mua không hài lòng với sản phẩm')}</div>
                            <div className="text-right"><span className="text-gray-400">Hoàn tiền cho người mua: </span><span className="font-bold text-gray-800">{formatVND(o.totalAmount)}</span></div>
                          </div>
                          <div className="pt-1 flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            {o.refundResolved ? (
                              <span className="text-emerald-600 flex items-center gap-1"><Check size={12} /> Đã xử lý xong</span>
                            ) : (
                              <button onClick={() => resolveReturn(o.id)} className="bg-[#EE4D2D] text-white px-4 py-2 rounded-sm font-bold text-xs">Xác Nhận Đã Xử Lý</button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* CHI TIẾT ĐƠN HÀNG */}
              {sellerPage === 'orderDetail' && viewingOrderId && (() => {
                const o = orders.find((x) => x.id === viewingOrderId);
                if (!o) return (
                  <div className="p-8 text-center text-gray-400">Không tìm thấy đơn hàng</div>
                );
                const meta = orderStatusMeta(o);
                const subtotal = o.items.reduce((s, it) => s + it.price * it.qty, 0);
                const shippingFee = subtotal >= FREE_SHIP_THRESHOLD ? 0 : SHIPPING_FEE;
                const isCancelledLike = o.orderStatus === 'Đã hủy' || o.orderStatus === 'Trả hàng/Hoàn tiền';
                const estimatedRevenue = isCancelledLike ? 0 : subtotal;
                const totalQty = o.items.reduce((s, it) => s + it.qty, 0);
                const fullInfoText = `${o.customerName || ''} - ${o.customerPhone || ''} - ${o.customerAddress || ''}`;
                return (
                  <div className="space-y-3">
                    <button onClick={() => goSellerPage(orderDetailBackTo)} className="flex items-center gap-1 text-gray-500 hover:text-[#EE4D2D] text-[11px]">
                      <ChevronLeft size={14} /> Quay lại
                    </button>
                    <h2 className="font-bold text-lg text-gray-800">Chi tiết đơn hàng</h2>

                    <div className="flex gap-4 items-start flex-col lg:flex-row">
                      <div className="flex-1 w-full min-w-0 space-y-3">
                        {/* Trạng thái */}
                        <div className="bg-white rounded-sm border border-gray-200 p-4 space-y-1.5">
                          <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <ListOrdered size={15} className="text-[#EE4D2D]" /> {meta.title}
                          </h3>
                          {meta.lines.map((l, i) => <p key={i} className="text-gray-500 pl-6">{l}</p>)}
                        </div>

                        {/* Mã đơn hàng / địa chỉ / vận chuyển */}
                        <div className="bg-white rounded-sm border border-gray-200 p-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-bold text-gray-700 mb-1">Mã đơn hàng</h4>
                              <p className="text-gray-600">{o.id}</p>
                            </div>
                            <button onClick={() => copyText('thông tin đặt đơn ngoài', fullInfoText)} className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded-sm text-[11px] flex items-center gap-1 hover:border-[#EE4D2D] hover:text-[#EE4D2D]">
                              <Copy size={12} /> Sao Chép Tên + SĐT + Địa Chỉ
                            </button>
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-700 mb-1">Người nhận hàng</h4>
                            <div className="flex items-center justify-between">
                              <p className="text-gray-700">{o.customerName || '—'}</p>
                              <button onClick={() => copyText('tên', o.customerName)} className="text-gray-400 hover:text-[#EE4D2D]"><Copy size={13} /></button>
                            </div>
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-700 mb-1">Số điện thoại</h4>
                            <div className="flex items-center justify-between">
                              <p className="text-gray-700">{o.customerPhone || '—'}</p>
                              <button onClick={() => copyText('số điện thoại', o.customerPhone)} className="text-gray-400 hover:text-[#EE4D2D]"><Copy size={13} /></button>
                            </div>
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-700 mb-1">Địa chỉ nhận hàng</h4>
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-gray-700">{o.customerAddress || '—'}</p>
                              <button onClick={() => copyText('địa chỉ', o.customerAddress)} className="text-gray-400 hover:text-[#EE4D2D] flex-shrink-0"><Copy size={13} /></button>
                            </div>
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-700 mb-1">Thông tin vận chuyển</h4>
                            <p className="text-gray-600 mb-2">Kiện hàng 1: Nhanh | {o.orderStatus === 'Vận chuyển' || o.orderStatus === 'Hoàn thành' ? 'SPX Express' : 'Chưa chọn đơn vị vận chuyển'}</p>
                            <div className="flex items-center gap-2">
                              <img src={o.items[0].image} className="w-10 h-10 object-cover rounded-sm border border-gray-100" />
                              <span className="text-gray-500">Total {totalQty} products</span>
                            </div>
                          </div>
                        </div>

                        {/* Người mua */}
                        <div className="bg-white rounded-sm border border-gray-200 p-4 flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className="w-9 h-9 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center font-bold">{(o.customerName || '?').charAt(0).toUpperCase()}</span>
                            <span className="font-medium text-gray-700">{o.customerName}</span>
                          </div>
                          <div className="flex gap-2">
                            <button className="bg-[#EE4D2D] text-white px-3.5 py-1.5 rounded-sm text-[11px] font-medium">Theo dõi</button>
                            <button className="border border-gray-300 text-gray-600 px-3.5 py-1.5 rounded-sm text-[11px] flex items-center gap-1"><MessageCircle size={12} /> Chat ngay</button>
                          </div>
                        </div>

                        {/* Thông tin thanh toán */}
                        <div className="bg-white rounded-sm border border-gray-200 p-4 space-y-3">
                          <h4 className="font-bold text-gray-700">Thông tin thanh toán</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left min-w-[520px]">
                              <thead className="text-gray-400 text-[11px] border-b border-gray-100">
                                <tr><th className="py-2">Sản phẩm</th><th className="py-2 text-right">Đơn Giá</th><th className="py-2 text-right">Số lượng</th><th className="py-2 text-right">Thành tiền</th></tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {o.items.map((it, idx) => (
                                  <tr key={idx}>
                                    <td className="py-2.5 flex items-center gap-2">
                                      <img src={it.image} className="w-10 h-10 object-cover rounded-sm border border-gray-100 flex-shrink-0" />
                                      <div>
                                        <div className="flex items-center gap-1.5">
                                          {isCancelledLike && <span className="bg-gray-200 text-gray-600 text-[9px] font-bold px-1 rounded-sm">{o.orderStatus === 'Đã hủy' ? 'Hủy' : 'Trả hàng'}</span>}
                                          <span className="line-clamp-1 max-w-[220px] text-gray-700">{it.name}</span>
                                        </div>
                                        <div className="text-gray-400">Phân loại: {it.variant}</div>
                                      </div>
                                    </td>
                                    <td className="py-2.5 text-right text-gray-600 whitespace-nowrap">{formatVND(it.price)}</td>
                                    <td className="py-2.5 text-right text-gray-600">{it.qty}</td>
                                    <td className="py-2.5 text-right font-medium text-gray-800 whitespace-nowrap">{formatVND(it.price * it.qty)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="border-t border-dashed border-gray-200 pt-3 space-y-1.5 text-gray-600">
                            <div className="flex justify-between"><span>Tổng tiền sản phẩm</span><span>{formatVND(isCancelledLike ? 0 : subtotal)}</span></div>
                            <div className="flex justify-between text-gray-400"><span>Giá sản phẩm</span><span>{formatVND(subtotal)}</span></div>
                            {isCancelledLike && <div className="flex justify-between text-gray-400"><span>Số tiền đã hủy</span><span>-{formatVND(subtotal)}</span></div>}
                            <div className="flex justify-between font-medium text-gray-700"><span>Tổng phí vận chuyển ước tính</span><span>{formatVND(isCancelledLike ? 0 : shippingFee)}</span></div>
                            <div className="flex justify-between text-gray-400 pl-3"><span>Phí vận chuyển Người mua trả</span><span>{formatVND(isCancelledLike ? 0 : shippingFee)}</span></div>
                            <div className="flex justify-between text-gray-400 pl-3"><span>Phí vận chuyển ước tính</span><span>{formatVND(0)}</span></div>
                            <div className="flex justify-between font-medium text-gray-700"><span>Tổng phụ dịch vụ giá trị gia tăng cho người mua</span><span>{formatVND(0)}</span></div>
                            <div className="flex justify-between font-bold text-gray-800 pt-1"><span>Doanh thu đơn hàng ước tính</span><span className="text-[#EE4D2D]">{formatVND(estimatedRevenue)}</span></div>
                          </div>
                        </div>

                        {/* Điều chỉnh đặt hàng */}
                        <div className="bg-white rounded-sm border border-gray-200 p-4 space-y-2">
                          <h4 className="font-bold text-gray-700">Điều chỉnh đặt hàng</h4>
                          <EmptyState icon={<Pencil size={28} />} text="Chưa có điều chỉnh nào được thực hiện theo thứ tự này" />
                        </div>

                        {/* Số tiền cuối cùng */}
                        <div className="bg-white rounded-sm border border-gray-200 p-4 flex justify-between items-center">
                          <h4 className="font-bold text-gray-700">Số tiền cuối cùng</h4>
                          <span className="text-[#EE4D2D] font-bold text-lg">{formatVND(estimatedRevenue)}</span>
                        </div>

                        {/* Thanh toán của người mua */}
                        <div className="bg-white rounded-sm border border-gray-200 p-4 space-y-1.5">
                          <h4 className="font-bold text-gray-700 mb-1">Thanh toán của Người Mua</h4>
                          <div className="flex justify-between text-gray-600"><span>Tổng tiền sản phẩm</span><span>{formatVND(subtotal)}</span></div>
                          <div className="flex justify-between text-gray-600"><span>Phí vận chuyển</span><span>{formatVND(shippingFee)}</span></div>
                          <div className="flex justify-between text-gray-600"><span>Shopee Mini Voucher</span><span>{formatVND(0)}</span></div>
                          <div className="flex justify-between text-gray-600"><span>Mã giảm giá của Shop</span><span>{formatVND(0)}</span></div>
                          <div className="flex justify-between font-bold text-gray-800 border-t border-dashed border-gray-200 pt-1.5"><span>Tổng tiền Thanh toán</span><span>{formatVND(subtotal + shippingFee)}</span></div>
                        </div>
                      </div>

                      {/* Sidebar: ghi chú + lịch sử */}
                      <div className="w-full lg:w-72 flex-shrink-0 lg:flex-shrink space-y-3">
                        <div className="bg-white rounded-sm border border-gray-200 p-4 space-y-2">
                          <h4 className="font-bold text-gray-700 flex items-center gap-1.5"><Pencil size={13} /> Thêm 1 ghi chú</h4>
                          <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Ghi chú nội bộ cho đơn hàng này..." rows={3} className="w-full border border-gray-200 rounded-sm px-2.5 py-2 outline-none focus:border-[#EE4D2D]" />
                          <button onClick={saveOrderNote} className="w-full bg-[#EE4D2D] text-white py-1.5 rounded-sm font-bold text-[11px]">Lưu Ghi Chú</button>
                        </div>
                        <div className="bg-white rounded-sm border border-gray-200 p-4">
                          <h4 className="font-bold text-gray-700 mb-3">Lịch sử đơn hàng</h4>
                          <div className="space-y-3">
                            {orderHistory(o).map((h, i) => (
                              <div key={i} className="flex gap-2.5">
                                <div className="flex flex-col items-center">
                                  <span className={`w-2.5 h-2.5 rounded-full ${i === 0 ? 'bg-[#EE4D2D]' : 'bg-gray-300'}`} />
                                  {i < orderHistory(o).length - 1 && <span className="w-px flex-1 bg-gray-200" />}
                                </div>
                                <div className="pb-3">
                                  <div className={i === 0 ? 'text-[#EE4D2D] font-bold' : 'text-gray-600'}>{h.label}</div>
                                  <div className="text-gray-400">{h.time}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* TRANG TRÍ SHOP - CHỈNH BANNER TRANG CHỦ */}
              {sellerPage === 'shopDecor' && (
                <div className="max-w-3xl space-y-3">
                  <h2 className="font-bold text-lg text-gray-800">Trang Trí Shop</h2>
                  <p className="text-gray-500 text-[11px]">Chỉnh nội dung banner hiển thị đầu Trang Chủ Mua Sắm.</p>

                  <div className="bg-white rounded-sm border border-gray-200 p-5 space-y-4">
                    <div>
                      <label className="block text-gray-600 text-[11px] mb-1.5">Nhãn nhỏ (tuỳ chọn)</label>
                      <input value={bannerDraft.tag} onChange={(e) => setBannerDraft({ ...bannerDraft, tag: e.target.value })} placeholder="VD: ƯU ĐÃI TUẦN NÀY" className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]" />
                    </div>
                    <div>
                      <label className="block text-gray-600 text-[11px] mb-1.5">Tiêu đề chính <span className="text-[#EE4D2D]">*</span></label>
                      <input value={bannerDraft.title} onChange={(e) => setBannerDraft({ ...bannerDraft, title: e.target.value })} placeholder="VD: SIÊU SALE PHỤ KIỆN CÔNG NGHỆ" className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]" />
                    </div>
                    <div>
                      <label className="block text-gray-600 text-[11px] mb-1.5">Mô tả phụ (tuỳ chọn)</label>
                      <input value={bannerDraft.subtitle} onChange={(e) => setBannerDraft({ ...bannerDraft, subtitle: e.target.value })} placeholder="VD: Giảm đến 50% · Freeship cho đơn từ 300.000đ" className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]" />
                    </div>

                    <div>
                      <label className="block text-gray-600 text-[11px] mb-1.5">Xem trước</label>
                      <div className="relative overflow-hidden bg-gradient-to-r from-[#f53d2d] via-[#f5502f] to-[#ff8552] rounded-2xl p-7 text-white shadow-md">
                        <div className="absolute -right-8 -top-10 w-44 h-44 rounded-full bg-white/10" />
                        <div className="absolute right-16 bottom-[-40px] w-28 h-28 rounded-full bg-white/10" />
                        <div className="relative">
                          {bannerDraft.tag && <span className="inline-block bg-white/20 backdrop-blur-sm text-[10px] font-bold px-2.5 py-1 rounded-full mb-2 tracking-wide">{bannerDraft.tag}</span>}
                          <h1 className="text-2xl font-black tracking-tight">{bannerDraft.title || 'TIÊU ĐỀ BANNER'}</h1>
                          {bannerDraft.subtitle && <p className="text-[12px] opacity-90 mt-1.5">{bannerDraft.subtitle}</p>}
                        </div>
                      </div>
                    </div>

                    <button onClick={saveBanner} className="w-full bg-[#EE4D2D] text-white py-2.5 rounded-sm font-bold flex items-center justify-center gap-2">
                      <Check size={15} /> Lưu Banner
                    </button>
                  </div>
                </div>
              )}

              {/* FLASH SALE CỦA SHOP */}
              {sellerPage === 'flashSaleAdmin' && (
                <>
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold text-lg text-gray-800 flex items-center gap-2"><Zap size={18} className="text-[#EE4D2D]" /> Flash Sale Của Shop</h2>
                    <span className="text-gray-400">{flashSaleProducts.length} sản phẩm đang Flash Sale</span>
                  </div>
                  <p className="text-gray-500 text-[11px] mb-1">Bật Flash Sale và đặt giá sốc cho sản phẩm — các sản phẩm này sẽ hiển thị ở mục Flash Sale trên Trang Chủ Mua Sắm.</p>
                  <div className="bg-white rounded-sm border border-gray-200 overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-gray-50 text-gray-500 text-[11px]">
                        <tr>
                          <th className="p-3">Bật</th><th className="p-3">Sản phẩm</th><th className="p-3">Giá gốc</th>
                          <th className="p-3">Giá Flash Sale</th><th className="p-3">Giảm</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {sellerProducts.map((p) => {
                          const discount = p.flashSale && p.flashPrice ? Math.round((1 - p.flashPrice / p.price) * 100) : 0;
                          return (
                            <tr key={p.id}>
                              <td className="p-3"><input type="checkbox" checked={!!p.flashSale} onChange={(e) => toggleFlashSale(p.id, e.target.checked)} className="accent-[#EE4D2D] w-4 h-4" /></td>
                              <td className="p-3 flex items-center gap-2"><img src={p.image} className="w-10 h-10 object-cover rounded-sm" /><span className="line-clamp-1 max-w-[220px]">{p.name}</span></td>
                              <td className="p-3 text-gray-500">{formatVND(p.price)}</td>
                              <td className="p-3">
                                <input
                                  type="number"
                                  disabled={!p.flashSale}
                                  value={p.flashPrice ?? ''}
                                  onChange={(e) => setFlashPrice(p.id, Number(e.target.value))}
                                  className="w-28 border border-gray-200 rounded-sm px-2 py-1.5 outline-none focus:border-[#EE4D2D] disabled:bg-gray-50 disabled:text-gray-300"
                                />
                              </td>
                              <td className="p-3">{p.flashSale && discount > 0 ? <span className="text-[#EE4D2D] font-bold">-{discount}%</span> : <span className="text-gray-300">—</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {sellerProducts.length === 0 && <div className="p-6 text-center text-gray-400">Chưa có sản phẩm nào</div>}
                  </div>
                </>
              )}

              {/* TRANG ĐANG PHÁT TRIỂN */}
              {sellerPage === 'placeholder' && (
                <div className="bg-white rounded-sm border border-gray-200 p-16 text-center space-y-3">
                  <div className="flex justify-center text-gray-300"><Settings size={40} /></div>
                  <h3 className="font-bold text-gray-700">{placeholderLabel}</h3>
                  <p className="text-gray-400">Tính năng này đang được phát triển và sẽ sớm ra mắt.</p>
                  <button onClick={() => goSellerPage('overview')} className="mt-2 text-[#EE4D2D] font-medium hover:underline">Quay lại Tổng Quan</button>
                </div>
              )}
            </main>
          </div>
        </div>
      )}
    </div>
  );
}