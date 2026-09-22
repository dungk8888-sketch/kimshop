import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Gift, X, Sparkles, Copy, Check, Loader2, Lock, ShieldAlert, PartyPopper } from 'lucide-react';
import { supabase, usernameToEmail, usernameToLegacyEmail, isValidUsername } from '../supabaseClient';
import {
  cacheGiftVoucher,
  effectiveVoucherStatus,
  formatVNDate,
  friendlyRpcError,
  loadCachedGiftVouchers,
  type OpenCampaignStatus,
  type OpenVoucherGiftResult,
} from './giftVoucherShared';

type Phase =
  | 'loading'
  | 'teaser'
  | 'authing'
  | 'opening'
  | 'result'
  | 'already'
  | 'unavailable'
  | 'outofstock'
  | 'notfound'
  | 'error';

type AlreadyVoucherView = {
  code: string;
  status: string;
  prizeLabel: string;
  campaignTitle: string;
  expiresAt: string | null;
};

function isTransientAuthError(error: any): boolean {
  if (!error) return false;
  const status = typeof error.status === 'number' ? error.status : null;
  return error.name === 'AuthRetryableFetchError' || status === 0 || (status !== null && status >= 500);
}

async function readEdgeFunctionError(error: any, data: any): Promise<string> {
  if (data && typeof data.error === 'string' && data.error) return data.error;
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json();
      if (body && typeof body.error === 'string' && body.error) return body.error;
      if (body && typeof body.message === 'string' && body.message) return body.message;
    }
  } catch {}
  return '';
}

const CONFETTI_COLORS = ['#EE4D2D', '#FFB020', '#22C55E', '#3B82F6', '#EC4899', '#F97316'];

export default function GiftVoucherCampaign({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [campaign, setCampaign] = useState<OpenCampaignStatus | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<OpenVoucherGiftResult | null>(null);
  const [already, setAlready] = useState<AlreadyVoucherView | null>(null);
  const [copied, setCopied] = useState(false);
  const pendingOpenRef = useRef(false);
  const openingRef = useRef(false);
  const authLockRef = useRef(false);

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [uname, setUname] = useState('');
  const [pwd, setPwd] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authErr, setAuthErr] = useState('');

  const loadAlreadyOpenedVoucher = async (row: OpenCampaignStatus, uid: string) => {
    const { data } = await supabase
      .from('user_vouchers')
      .select('code,status,expires_at')
      .eq('user_id', uid)
      .eq('campaign_id', row.campaign_id)
      .order('issued_at', { ascending: false })
      .limit(1);
    const v = Array.isArray(data) ? data[0] : null;
    if (v) {
      const cached = loadCachedGiftVouchers(uid).find((c) => c.code === v.code);
      setAlready({
        code: v.code,
        status: v.status,
        expiresAt: v.expires_at,
        prizeLabel: cached?.prizeLabel || 'Mã ưu đãi KIMSHOP',
        campaignTitle: cached?.campaignTitle || row.title,
      });
    }
    setPhase('already');
  };

  const loadStatus = async () => {
    setPhase('loading');
    setErrorMsg('');
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id || null;
    setIsLoggedIn(!!uid);

    const { data, error } = await supabase.rpc('get_campaign_open_status', { p_campaign_slug: slug });
    if (error) {
      setErrorMsg(error.message || 'Không thể tải chương trình.');
      setPhase('error');
      return;
    }
    const row: OpenCampaignStatus | undefined = Array.isArray(data) ? data[0] : (data as any);
    if (!row) {
      setPhase('notfound');
      return;
    }
    setCampaign(row);
    if (!row.is_live) {
      setPhase('unavailable');
      return;
    }
    if (uid && !row.can_open && row.user_opens_count >= row.max_opens_per_user) {
      await loadAlreadyOpenedVoucher(row, uid);
      return;
    }
    setPhase('teaser');
  };

  useEffect(() => {
    loadStatus();
  }, [slug]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setIsLoggedIn(!!session?.user));
    return () => sub?.subscription?.unsubscribe();
  }, []);

  const doOpenGiftInner = async () => {
    setPhase('opening');
    const { data, error } = await supabase.rpc('open_voucher_gift', { p_campaign_slug: slug });
    if (error) {
      const code = (error.message || '').trim();
      const errCode = String((error as any).code || '');
      const needsLogin = code === 'AUTH_REQUIRED' || errCode === '42501' || errCode === 'PGRST301';
      if (needsLogin) {
        pendingOpenRef.current = true;
        setAuthMode('login');
        setAuthErr('');
        setPhase('authing');
        return;
      }
      if (code === 'ALREADY_OPENED') {
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData?.session?.user?.id;
        if (campaign && uid) {
          await loadAlreadyOpenedVoucher(campaign, uid);
          return;
        }
      }
      if (code === 'CAMPAIGN_NOT_AVAILABLE') {
        setPhase('unavailable');
        return;
      }
      if (code === 'OUT_OF_STOCK') {
        setPhase('outofstock');
        return;
      }
      setErrorMsg(friendlyRpcError(code));
      setPhase('error');
      return;
    }
    const row: OpenVoucherGiftResult | undefined = Array.isArray(data) ? data[0] : (data as any);
    if (!row) {
      setErrorMsg('Không nhận được kết quả từ hệ thống, vui lòng thử lại.');
      setPhase('error');
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id;
    if (uid) {
      cacheGiftVoucher({
        code: row.voucher_code,
        userId: uid,
        prizeLabel: row.prize_label,
        campaignTitle: row.campaign_title,
      });
    }
    window.setTimeout(() => {
      setResult(row);
      setPhase('result');
    }, 900);
  };

  const doOpenGift = async () => {
    if (openingRef.current) return;
    openingRef.current = true;
    try {
      await doOpenGiftInner();
    } finally {
      openingRef.current = false;
    }
  };

  const handleOpenClick = async () => {
    if (openingRef.current || authLockRef.current) return;
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session?.user) {
      pendingOpenRef.current = true;
      setIsLoggedIn(false);
      setAuthMode('login');
      setAuthErr('');
      setPhase('authing');
      return;
    }
    setIsLoggedIn(true);
    void doOpenGift();
  };

  const afterAuthSuccess = () => {
    setIsLoggedIn(true);
    setPwd('');
    if (pendingOpenRef.current) {
      pendingOpenRef.current = false;
      void doOpenGift();
    } else {
      void loadStatus();
    }
  };

  const submitLogin = async () => {
    if (authLockRef.current) return;
    const u = uname.trim().toLowerCase();
    if (!u || !pwd) {
      setAuthErr('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }
    authLockRef.current = true;
    setAuthBusy(true);
    setAuthErr('');
    let ok = false;
    try {
      let { data, error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(u), password: pwd });
      if ((error || !data?.user) && u !== 'admin' && !isTransientAuthError(error)) {
        const legacy = await supabase.auth.signInWithPassword({ email: usernameToLegacyEmail(u), password: pwd });
        data = legacy.data;
        error = legacy.error;
      }
      if (error || !data?.user) {
        setAuthErr(isTransientAuthError(error) ? 'Không kết nối được máy chủ, vui lòng thử lại.' : 'Sai tên đăng nhập hoặc mật khẩu.');
      } else {
        ok = true;
      }
    } catch {
      setAuthErr('Không kết nối được máy chủ, vui lòng thử lại.');
    } finally {
      authLockRef.current = false;
      setAuthBusy(false);
    }
    if (ok) afterAuthSuccess();
  };

  const submitRegister = async () => {
    if (authLockRef.current) return;
    const u = uname.trim().toLowerCase();
    if (!u || !pwd) {
      setAuthErr('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }
    if (!isValidUsername(u)) {
      setAuthErr('Tên đăng nhập 3–32 ký tự: chữ thường, số, ".", "_" hoặc "-".');
      return;
    }
    if (pwd.length < 8) {
      setAuthErr('Mật khẩu phải có ít nhất 8 ký tự.');
      return;
    }
    authLockRef.current = true;
    setAuthBusy(true);
    setAuthErr('');
    let ok = false;
    try {
      const { data: registerData, error: registerError } = await supabase.functions.invoke('register-username', {
        body: { username: u, password: pwd, full_name: u, phone: '' },
      });
      if (registerError || !registerData?.ok) {
        const serverMsg = await readEdgeFunctionError(registerError, registerData);
        setAuthErr(serverMsg || 'Không thể tạo tài khoản, vui lòng thử lại.');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(u), password: pwd });
        if (error || !data?.user) {
          setAuthErr('Tạo tài khoản thành công, vui lòng bấm "Đăng nhập".');
          setAuthMode('login');
        } else {
          ok = true;
        }
      }
    } catch {
      setAuthErr('Không kết nối được máy chủ, vui lòng thử lại.');
    } finally {
      authLockRef.current = false;
      setAuthBusy(false);
    }
    if (ok) afterAuthSuccess();
  };

  const copyCode = (code: string) => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
    try { navigator.clipboard?.writeText(code); } catch {}
  };

  const confettiPieces = useMemo(
    () =>
      Array.from({ length: 26 }).map((_, i) => ({
        left: Math.round(Math.random() * 100),
        delay: Math.round(Math.random() * 260),
        rotate: Math.round(Math.random() * 360),
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    []
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-[2px] gift-anim-overlay p-4">
      <div className="gift-premium-card relative w-full max-w-md rounded-[30px] overflow-hidden shadow-2xl max-h-[92vh]">
        <button onClick={onClose} aria-label="Đóng" className="absolute right-3 top-3 z-10 w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center text-gray-500 hover:text-gray-800">
          <X size={18} />
        </button>
        <div className="gift-premium-inner relative px-6 pt-6 pb-6 flex flex-col items-center text-center min-h-[400px] justify-start">
          <div className="gift-premium-orb gift-premium-orb-a" />
          <div className="gift-premium-orb gift-premium-orb-b" />
          {phase === 'loading' && <div className="flex flex-col items-center gap-3 text-gray-400"><Loader2 size={30} className="animate-spin" /><p className="text-sm">Đang tải hộp quà...</p></div>}
          {phase === 'notfound' && <EmptyState icon={<ShieldAlert size={40} className="text-gray-300" />} title="Không tìm thấy chương trình" desc="Đường dẫn quà tặng này không tồn tại hoặc đã bị gỡ." onClose={onClose} />}
          {phase === 'unavailable' && <EmptyState icon={<ShieldAlert size={40} className="text-gray-300" />} title="Chương trình chưa mở hoặc đã kết thúc" desc="Hộp quà này hiện chưa mở được. Theo dõi Fanpage KIMSHOP để không bỏ lỡ nhé!" onClose={onClose} />}
          {phase === 'outofstock' && <EmptyState icon={<Gift size={40} className="text-gray-300" />} title="Đã hết lượt quà" desc="Rất tiếc, tất cả phần quà của chương trình này đã được nhận hết." onClose={onClose} />}
          {phase === 'error' && <EmptyState icon={<ShieldAlert size={40} className="text-rose-300" />} title="Có lỗi xảy ra" desc={errorMsg || 'Vui lòng thử lại sau.'} onClose={onClose} retry={loadStatus} />}

          {(phase === 'teaser' || phase === 'opening') && campaign && (
            <>
              <div className="gift-hero relative mb-3 flex flex-col items-center">
                <div className="gift-premium-rays" />
                <div className="gift-premium-halo gift-anim-glow" />
                <span className="gift-deco gift-deco-1" />
                <span className="gift-deco gift-deco-2" />
                <span className="gift-deco gift-deco-3" />
                <span className="gift-deco gift-deco-4" />
                <span className="gift-deco gift-deco-5" />
                <span className="gift-deco gift-deco-6" />
                <div className="gift-ribbon-swoosh gift-ribbon-swoosh-a" />
                <div className="gift-ribbon-swoosh gift-ribbon-swoosh-b" />
                <div className="gift-burst-star gift-burst-star-a">✦</div>
                <div className="gift-burst-star gift-burst-star-b">✦</div>
                <div className="gift-burst-star gift-burst-star-c">✧</div>
                <div className="gift-stage-ring" />
                <div className={`gift-box-wrap ${phase === 'opening' ? 'gift-anim-shake gift-box-open' : 'gift-anim-float'}`}>
                  <div className="gift-box-shadow" />
                  <svg className="gift-svg-3d" viewBox="0 0 220 190" aria-label="Hộp quà KIMSHOP" role="img">
                    <defs>
                      <linearGradient id="giftBlueFront" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#5D91FF" />
                        <stop offset="38%" stopColor="#2F69EE" />
                        <stop offset="100%" stopColor="#173A97" />
                      </linearGradient>
                      <linearGradient id="giftBlueSide" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#2859CF" />
                        <stop offset="100%" stopColor="#102B78" />
                      </linearGradient>
                      <linearGradient id="giftGold" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#E99400" />
                        <stop offset="28%" stopColor="#FFD85B" />
                        <stop offset="52%" stopColor="#FFF0A0" />
                        <stop offset="76%" stopColor="#FFC52C" />
                        <stop offset="100%" stopColor="#DF8700" />
                      </linearGradient>
                      <radialGradient id="giftInsideGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#FFFCE3" stopOpacity="1" />
                        <stop offset="42%" stopColor="#FFD85A" stopOpacity=".9" />
                        <stop offset="100%" stopColor="#FF9C1A" stopOpacity="0" />
                      </radialGradient>
                      <filter id="giftShadow" x="-40%" y="-40%" width="180%" height="200%">
                        <feDropShadow dx="0" dy="14" stdDeviation="12" floodColor="#153B8F" floodOpacity=".30"/>
                      </filter>
                    </defs>

                    <ellipse cx="110" cy="164" rx="63" ry="13" fill="rgba(27,63,145,.20)" />

                    <g className="gift-svg-glow">
                      <ellipse cx="110" cy="95" rx="75" ry="66" fill="url(#giftInsideGlow)" />
                    </g>

                    <g filter="url(#giftShadow)">
                      <g className="gift-svg-body">
                        <path d="M56 82 L110 71 L165 82 L165 145 Q165 158 152 161 L69 161 Q56 158 56 145 Z" fill="url(#giftBlueFront)" />
                        <path d="M56 82 L110 71 L110 161 L69 161 Q56 158 56 145 Z" fill="rgba(255,255,255,.07)" />
                        <path d="M165 82 L110 71 L110 161 L152 161 Q165 158 165 145 Z" fill="url(#giftBlueSide)" opacity=".42" />
                        <rect x="98" y="75" width="25" height="86" rx="4" fill="url(#giftGold)" />
                        <rect x="56" y="104" width="109" height="24" rx="3" fill="url(#giftGold)" />
                        <path d="M66 88 Q96 75 126 80" stroke="rgba(255,255,255,.28)" strokeWidth="8" strokeLinecap="round" fill="none" />
                        <path d="M72 146 Q107 156 146 145" stroke="rgba(255,255,255,.10)" strokeWidth="7" strokeLinecap="round" fill="none" />
                      </g>

                      <g className="gift-svg-lid">
                        <path d="M47 71 Q47 57 61 54 L110 46 L161 54 Q175 57 175 71 L171 87 L51 87 Z" fill="url(#giftBlueFront)" />
                        <path d="M98 48 L123 48 L123 87 L98 87 Z" fill="url(#giftGold)" />
                        <path d="M60 62 Q104 48 154 61" stroke="rgba(255,255,255,.32)" strokeWidth="8" strokeLinecap="round" fill="none" />
                        <g className="gift-svg-bow">
                          <path d="M108 49 C87 28 70 31 74 45 C77 56 94 57 108 50 Z" fill="url(#giftGold)" />
                          <path d="M113 49 C134 28 151 31 147 45 C144 56 127 57 113 50 Z" fill="url(#giftGold)" />
                          <circle cx="110" cy="49" r="9" fill="#FFC62E" />
                          <circle cx="108" cy="46" r="3.5" fill="#FFF2A1" opacity=".8" />
                        </g>
                      </g>
                    </g>

                    <g className="gift-svg-coins">
                      <circle cx="54" cy="69" r="8" fill="#FFC934" stroke="#FFF2A0" strokeWidth="2" />
                      <circle cx="173" cy="67" r="7" fill="#FFB817" stroke="#FFF2A0" strokeWidth="2" />
                      <circle cx="153" cy="39" r="5" fill="#FFD95A" />
                    </g>
                  </svg>
                  <Sparkles size={20} className="absolute top-2 right-5 text-yellow-300" />
                  <Sparkles size={16} className="absolute left-7 top-10 text-yellow-200" />
                  <Sparkles size={12} className="absolute right-7 bottom-10 text-orange-200" />
                  <div className="gift-coin" style={{ left: '10px', top: '24px', animationDelay: '0ms' }} />
                  <div className="gift-coin" style={{ right: '14px', top: '42px', animationDelay: '220ms' }} />
                  <div className="gift-coin" style={{ left: '34px', bottom: '26px', animationDelay: '420ms' }} />
                  <div className="gift-coin" style={{ right: '28px', bottom: '32px', animationDelay: '620ms' }} />
                  <div className="gift-premium-ticket gift-premium-ticket-left">%</div>
                  <div className="gift-premium-ticket gift-premium-ticket-right">FS</div>
                  <div className="gift-open-light" />
                </div>
              </div>
              <div className="gift-premium-badges gift-anim-fadeup">
                <span><b>Giảm đến 50.000đ</b></span>
                <span><b>Freeship</b></span>
              </div>
              <h2 className="gift-premium-title text-[21px] leading-tight font-extrabold text-slate-800 mb-2 gift-anim-fadeup">{campaign.title}</h2>
              {campaign.description && <p className="text-[13px] leading-relaxed text-slate-500 mb-5 max-w-[330px] gift-anim-fadeup">{campaign.description}</p>}
              <button onClick={handleOpenClick} disabled={phase === 'opening'} className="gift-premium-cta w-full max-w-[310px] text-white font-extrabold py-4 rounded-[22px] transition-all disabled:opacity-80 flex items-center justify-center gap-2 text-[15px]">
                {phase === 'opening' ? <><Loader2 size={18} className="animate-spin" /> Đang mở quà...</> : <><Gift size={18} /> {isLoggedIn ? 'Mở quà ngay' : 'Mở quà — Đăng nhập để nhận'}</>}
              </button>
              <p className="text-[11px] text-slate-400 mt-3">Mỗi tài khoản được mở tối đa {campaign.max_opens_per_user} lần.</p>
            </>
          )}

          {phase === 'authing' && (
            <div className="w-full text-left gift-anim-fadeup">
              <div className="flex items-center gap-2 justify-center mb-1.5"><Lock size={16} className="text-[#EE4D2D]" /><h3 className="font-bold text-gray-800">{authMode === 'login' ? 'Đăng nhập để mở quà' : 'Tạo tài khoản để nhận quà'}</h3></div>
              <p className="text-[12px] text-gray-500 text-center mb-4">Mở quà xong sẽ quay lại ngay chương trình này.</p>
              <div className="space-y-2.5">
                <input autoFocus value={uname} onChange={(e) => setUname(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (authMode === 'login' ? submitLogin() : submitRegister())} placeholder="Tên đăng nhập" className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 outline-none focus:border-[#EE4D2D] text-sm" />
                <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (authMode === 'login' ? submitLogin() : submitRegister())} placeholder="Mật khẩu" className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 outline-none focus:border-[#EE4D2D] text-sm" />
                {authErr && <p className="text-[12px] text-rose-500">{authErr}</p>}
                <button onClick={authMode === 'login' ? submitLogin : submitRegister} disabled={authBusy} className="w-full bg-[#EE4D2D] hover:bg-[#f63] text-white font-bold py-2.5 rounded-xl disabled:opacity-70 flex items-center justify-center gap-2">
                  {authBusy && <Loader2 size={16} className="animate-spin" />}
                  {authMode === 'login' ? 'Đăng Nhập & Mở Quà' : 'Đăng Ký & Mở Quà'}
                </button>
                <p className="text-center text-[12px] text-gray-500">
                  {authMode === 'login' ? <>Chưa có tài khoản? <button className="text-blue-600 font-medium hover:underline" onClick={() => { setAuthMode('register'); setAuthErr(''); }}>Đăng ký ngay</button></> : <>Đã có tài khoản? <button className="text-blue-600 font-medium hover:underline" onClick={() => { setAuthMode('login'); setAuthErr(''); }}>Đăng nhập</button></>}
                </p>
              </div>
            </div>
          )}

          {phase === 'result' && result && (
            <div className="w-full relative">
              <div className="pointer-events-none absolute inset-x-0 -top-4 h-24 overflow-hidden">
                {confettiPieces.map((c, i) => <span key={i} className="gift-confetti-piece" style={{ left: `${c.left}%`, backgroundColor: c.color, animationDelay: `${c.delay}ms`, transform: `rotate(${c.rotate}deg)` }} />)}
              </div>
              <div className="gift-anim-pop flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-[#EE4D2D]/10 flex items-center justify-center mb-3"><PartyPopper size={30} className="text-[#EE4D2D]" /></div>
                <h2 className="text-lg font-bold text-gray-800">Chúc mừng bạn!</h2>
                <p className="text-[13px] text-gray-500 mb-4">{result.campaign_title}</p>
                <div className="w-full rounded-2xl border-2 border-dashed border-[#EE4D2D]/40 bg-orange-50/60 p-4 mb-4">
                  <p className="text-[11px] text-gray-500 mb-1">Bạn nhận được</p>
                  <p className="font-bold text-[#EE4D2D] text-base mb-2.5">{result.prize_label}</p>
                  <div className="flex items-center justify-between gap-2 bg-white rounded-xl border border-gray-200 px-3 py-2.5">
                    <span className="font-mono font-bold tracking-wider text-gray-800 text-sm truncate">{result.voucher_code}</span>
                    <button onClick={() => copyCode(result.voucher_code)} className="flex-shrink-0 text-[#EE4D2D] flex items-center gap-1 text-[12px] font-bold">{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Đã chép' : 'Sao chép'}</button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">Hạn dùng: {formatVNDate(result.expires_at)}</p>
                </div>
                <p className="text-[12px] text-gray-500 mb-5">Mã này dùng trực tiếp ở bước Thanh Toán khi mua hộp chân sạc thông dụng. Bạn cũng có thể xem lại bất cứ lúc nào ở mục "Voucher của tôi".</p>
                <button onClick={onClose} className="w-full max-w-[220px] bg-[#EE4D2D] hover:bg-[#f63] text-white font-bold py-3 rounded-2xl">Tuyệt vời!</button>
              </div>
            </div>
          )}

          {phase === 'already' && (
            <div className="w-full flex flex-col items-center gift-anim-fadeup">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3"><Gift size={28} className="text-gray-400" /></div>
              <h2 className="text-lg font-bold text-gray-800 mb-1">Bạn đã mở quà này rồi</h2>
              <p className="text-[13px] text-gray-500 mb-4">{already?.campaignTitle || campaign?.title}</p>
              {already && (
                <div className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 mb-4">
                  <p className="text-[11px] text-gray-500 mb-1">{already.prizeLabel}</p>
                  <div className="flex items-center justify-between gap-2 bg-white rounded-xl border border-gray-200 px-3 py-2.5">
                    <span className="font-mono font-bold tracking-wider text-gray-800 text-sm truncate">{already.code}</span>
                    <button onClick={() => copyCode(already.code)} className="flex-shrink-0 text-[#EE4D2D] flex items-center gap-1 text-[12px] font-bold">{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Đã chép' : 'Sao chép'}</button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">
                    {(() => {
                      const st = effectiveVoucherStatus(already.status, already.expiresAt);
                      return `Trạng thái: ${st === 'used' ? 'Đã dùng' : st === 'expired' ? 'Hết hạn' : st === 'revoked' ? 'Đã huỷ' : 'Còn hiệu lực'}`;
                    })()}
                    {' · '}Hạn dùng: {formatVNDate(already.expiresAt)}
                  </p>
                </div>
              )}
              <button onClick={onClose} className="w-full max-w-[220px] bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-2xl">Đóng</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, desc, onClose, retry }: { icon: React.ReactNode; title: string; desc: string; onClose: () => void; retry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 gift-anim-fadeup">
      {icon}
      <h3 className="font-bold text-gray-700">{title}</h3>
      <p className="text-[13px] text-gray-500 max-w-xs">{desc}</p>
      <div className="flex gap-2 mt-1">
        {retry && <button onClick={retry} className="px-4 py-2 rounded-xl text-sm font-bold bg-gray-100 text-gray-700">Thử lại</button>}
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold bg-[#EE4D2D] text-white">Đóng</button>
      </div>
    </div>
  );
}
