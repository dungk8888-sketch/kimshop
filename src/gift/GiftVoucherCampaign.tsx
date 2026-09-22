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
  const [boxStage, setBoxStage] = useState<'idle' | 'shake' | 'burst'>('idle');
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

  useEffect(() => {
    if (phase === 'opening') {
      setBoxStage('shake');
      const t = window.setTimeout(() => setBoxStage('burst'), 420);
      return () => window.clearTimeout(t);
    }
    if (phase === 'teaser') setBoxStage('idle');
  }, [phase]);

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

  const burstConfetti = useMemo(
    () =>
      Array.from({ length: 18 }).map((_, i) => ({
        left: Math.round(10 + Math.random() * 80),
        top: Math.round(18 + Math.random() * 42),
        delay: Math.round(Math.random() * 240),
        rotate: Math.round(Math.random() * 360),
        dx: Math.round((Math.random() - 0.5) * 92),
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    []
  );

  const boxWrapAnimClass =
    boxStage === 'shake' ? 'gift-anim-shake-once' : boxStage === 'burst' ? 'gift-anim-burst-settle' : 'gift-anim-float';

  const campaignTitleNode = (() => {
    const title = campaign?.title || '';
    const match = title.match(/^(.*?)(?:\s+)?KIMSHOP$/i);
    if (!match) return title;
    const before = match[1].trim();
    const dashIndex = before.indexOf('—');
    if (dashIndex >= 0) {
      return (
        <>
          {before.slice(0, dashIndex + 1)}
          <br />
          {before.slice(dashIndex + 1).trim()} <span className="gift-title-brand">KIMSHOP</span>
        </>
      );
    }
    return <>{before} <span className="gift-title-brand">KIMSHOP</span></>;
  })();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-[2px] gift-anim-overlay p-4">
      <div className="gift-premium-card relative w-full max-w-[480px] rounded-[34px] overflow-hidden shadow-2xl max-h-[92vh] border border-white/60">
        <button onClick={onClose} aria-label="Đóng" className="absolute right-3 top-3 z-10 w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center text-gray-500 hover:text-gray-800">
          <X size={18} />
        </button>
        <div className="gift-premium-inner relative px-6 pt-7 pb-8 flex flex-col items-center text-center min-h-[430px] justify-start">
          <div className="gift-premium-orb gift-premium-orb-a" />
          <div className="gift-premium-orb gift-premium-orb-b" />
          {phase === 'loading' && <div className="flex flex-col items-center gap-3 text-gray-400"><Loader2 size={30} className="animate-spin" /><p className="text-sm">Đang tải hộp quà...</p></div>}
          {phase === 'notfound' && <EmptyState icon={<ShieldAlert size={40} className="text-gray-300" />} title="Không tìm thấy chương trình" desc="Đường dẫn quà tặng này không tồn tại hoặc đã bị gỡ." onClose={onClose} />}
          {phase === 'unavailable' && <EmptyState icon={<ShieldAlert size={40} className="text-gray-300" />} title="Chương trình chưa mở hoặc đã kết thúc" desc="Hộp quà này hiện chưa mở được. Theo dõi Fanpage KIMSHOP để không bỏ lỡ nhé!" onClose={onClose} />}
          {phase === 'outofstock' && <EmptyState icon={<Gift size={40} className="text-gray-300" />} title="Đã hết lượt quà" desc="Rất tiếc, tất cả phần quà của chương trình này đã được nhận hết." onClose={onClose} />}
          {phase === 'error' && <EmptyState icon={<ShieldAlert size={40} className="text-rose-300" />} title="Có lỗi xảy ra" desc={errorMsg || 'Vui lòng thử lại sau.'} onClose={onClose} retry={loadStatus} />}

          {(phase === 'teaser' || phase === 'opening') && campaign && (
            <>
              <svg className="gift-card-ribbons" viewBox="0 0 420 520" aria-hidden="true">
                <defs>
                  <linearGradient id="giftCardRibbonGold" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FFF1B5" stopOpacity=".88" />
                    <stop offset="28%" stopColor="#FFC743" stopOpacity=".92" />
                    <stop offset="70%" stopColor="#EE9A07" stopOpacity=".88" />
                    <stop offset="100%" stopColor="#FFE69B" stopOpacity=".72" />
                  </linearGradient>
                </defs>
                <path className="gift-card-ribbon gift-card-ribbon-left" d="M-20 505 C12 468 52 440 35 402 C22 374 0 359 12 328" />
                <path className="gift-card-ribbon-highlight" d="M-20 505 C12 468 52 440 35 402 C22 374 0 359 12 328" />
                <path className="gift-card-ribbon gift-card-ribbon-right" d="M440 505 C408 468 368 440 385 402 C398 374 420 359 408 328" />
                <path className="gift-card-ribbon-highlight" d="M440 505 C408 468 368 440 385 402 C398 374 420 359 408 328" />
              </svg>
              <div className="relative mb-5 flex flex-col items-center gift-premium-hero w-full">
                <div className="gift-premium-bg" />
                <div className="gift-premium-sheen" />
                <div className={`gift-box-wrap ${boxWrapAnimClass}`}>
                  <svg
                    className={`gift-scene-svg ${boxStage === 'burst' ? 'is-open' : 'is-teaser-open'}`}
                    viewBox="0 0 420 280"
                    role="img"
                    aria-label="Hộp quà KIMSHOP"
                  >
                    <defs>
                      <radialGradient id="giftSceneBg" cx="50%" cy="43%" r="68%">
                        <stop offset="0%" stopColor="#fffdf4" />
                        <stop offset="38%" stopColor="#fff2c8" />
                        <stop offset="72%" stopColor="#ffd884" stopOpacity=".62" />
                        <stop offset="100%" stopColor="#ffca68" stopOpacity="0" />
                      </radialGradient>
                      <linearGradient id="giftBlueFront" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#2E67D8" />
                        <stop offset="16%" stopColor="#73A8FF" />
                        <stop offset="32%" stopColor="#2866D9" />
                        <stop offset="54%" stopColor="#1549AA" />
                        <stop offset="69%" stopColor="#5E94F1" />
                        <stop offset="82%" stopColor="#275EC9" />
                        <stop offset="100%" stopColor="#12327F" />
                      </linearGradient>
                      <linearGradient id="giftBlueSide" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#315fc7" />
                        <stop offset="100%" stopColor="#0b2369" />
                      </linearGradient>
                      <linearGradient id="giftBlueLid" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#2D66D7" />
                        <stop offset="18%" stopColor="#83B5FF" />
                        <stop offset="34%" stopColor="#3475EA" />
                        <stop offset="55%" stopColor="#174CB3" />
                        <stop offset="73%" stopColor="#6A9DF4" />
                        <stop offset="88%" stopColor="#2A61CF" />
                        <stop offset="100%" stopColor="#153783" />
                      </linearGradient>
                      <linearGradient id="giftGold" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#b96800" />
                        <stop offset="18%" stopColor="#ef9e08" />
                        <stop offset="38%" stopColor="#ffd858" />
                        <stop offset="52%" stopColor="#fff2ad" />
                        <stop offset="70%" stopColor="#ffc62f" />
                        <stop offset="100%" stopColor="#b86a00" />
                      </linearGradient>
                      <linearGradient id="giftGoldSoft" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#fff1a8" />
                        <stop offset="36%" stopColor="#ffd248" />
                        <stop offset="72%" stopColor="#e99a08" />
                        <stop offset="100%" stopColor="#a85c00" />
                      </linearGradient>
                      <linearGradient id="giftSwoosh" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#f5a315" stopOpacity="0" />
                        <stop offset="18%" stopColor="#ffc84b" stopOpacity=".68" />
                        <stop offset="48%" stopColor="#fff1b0" stopOpacity=".96" />
                        <stop offset="76%" stopColor="#f6a814" stopOpacity=".72" />
                        <stop offset="100%" stopColor="#f6a814" stopOpacity="0" />
                      </linearGradient>
                      <radialGradient id="giftInnerBurst" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                        <stop offset="28%" stopColor="#fff6bb" stopOpacity=".98" />
                        <stop offset="56%" stopColor="#ffc94c" stopOpacity=".68" />
                        <stop offset="100%" stopColor="#ff9b1a" stopOpacity="0" />
                      </radialGradient>
                      <filter id="giftSoftShadow" x="-50%" y="-50%" width="200%" height="220%">
                        <feGaussianBlur stdDeviation="8" />
                      </filter>
                      <filter id="giftTinyShadow" x="-40%" y="-40%" width="180%" height="200%">
                        <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#6d3b00" floodOpacity=".23" />
                      </filter>
                    </defs>

                    <ellipse cx="210" cy="147" rx="183" ry="126" fill="url(#giftSceneBg)" />
                    <g className="gift-svg-rays" opacity=".42">
                      <path d="M210 137 L175 7 L198 7 Z" fill="#fff" opacity=".55" />
                      <path d="M210 137 L225 5 L246 10 Z" fill="#fff" opacity=".42" />
                      <path d="M210 137 L79 37 L95 24 Z" fill="#fff" opacity=".38" />
                      <path d="M210 137 L337 31 L350 47 Z" fill="#fff" opacity=".38" />
                      <path d="M210 137 L54 117 L58 96 Z" fill="#fff" opacity=".28" />
                      <path d="M210 137 L360 103 L364 124 Z" fill="#fff" opacity=".28" />
                    </g>

                    <g className="gift-svg-swoosh-back">
                      <path d="M27 167 C83 91 148 74 197 98 M244 94 C307 71 365 97 397 142" fill="none" stroke="rgba(177,101,0,.12)" strokeWidth="18" strokeLinecap="round" />
                      <path d="M27 167 C83 91 148 74 197 98 M244 94 C307 71 365 97 397 142" fill="none" stroke="url(#giftSwoosh)" strokeWidth="10" strokeLinecap="round" />
                      <path d="M42 159 C96 104 150 89 194 103 M248 100 C303 83 350 100 383 137" fill="none" stroke="#fff3c1" strokeOpacity=".78" strokeWidth="2.2" strokeLinecap="round" />
                    </g>

                    <ellipse className="gift-svg-floor-shadow" cx="210" cy="228" rx="92" ry="20" fill="#112354" opacity=".2" filter="url(#giftSoftShadow)" />

                    <g className="gift-svg-open-glow">
                      <circle cx="210" cy="139" r="108" fill="url(#giftInnerBurst)" />
                      <path d="M210 139 L156 22 L190 36 Z" fill="#fff8c7" opacity=".68" />
                      <path d="M210 139 L252 18 L272 42 Z" fill="#fff2a3" opacity=".56" />
                      <path d="M210 139 L99 62 L126 54 Z" fill="#fff8cf" opacity=".36" />
                      <path d="M210 139 L320 55 L335 78 Z" fill="#fff4ad" opacity=".34" />
                    </g>

                    <g className="gift-svg-box">
                      <g className="gift-svg-body">
                        <path d="M143 140 L158 130 H260 L277 140 L269 232 Q267 243 256 247 H161 Q150 244 148 233 Z" fill="url(#giftBlueFront)" />
                        <path d="M143 140 L158 130 H260 L277 140 L261 151 H159 Z" fill="#79A9FA" opacity=".92" />
                        <path d="M143 140 L159 151 L161 244 Q151 241 149 232 Z" fill="#2B60C8" opacity=".9" />
                        <path d="M257 151 L277 140 L269 232 Q267 242 257 246 Z" fill="#0B2C79" opacity=".76" />
                        <path d="M159 151 H202 V244 H161 Z" fill="url(#giftBlueFront)" opacity=".92" />
                        <path d="M202 151 H257 V246 H202 Z" fill="url(#giftBlueFront)" />
                        <path d="M208 153 H216 V244 H208 Z" fill="#A9C9FF" opacity=".22" />
                        <path d="M162 154 H169 V239 H162 Z" fill="#FFFFFF" opacity=".13" />
                        <path d="M249 153 H256 V241 H249 Z" fill="#081F62" opacity=".16" />
                        <path d="M193 142 H220 L220 246 H193 Z" fill="url(#giftGold)" />
                        <path d="M200 144 H208 V243 H200 Z" fill="#FFF4B2" opacity=".55" />
                      </g>

                      <g className="gift-svg-cavity">
                        <path d="M153 140 L169 132 H251 L266 140 L251 149 H169 Z" fill="#10265C" opacity=".94" stroke="#E8A51A" strokeWidth="3" />
                        <path d="M166 139 L177 135 H244 L254 140 L244 145 H176 Z" fill="#FFF9D5" opacity=".94" />
                        <ellipse cx="210" cy="140" rx="38" ry="8" fill="url(#giftInnerBurst)" opacity=".98" />
                      </g>

                      <g className="gift-svg-lid">
                        <path d="M126 123 L286 132 L299 143 L137 135 Z" fill="#9DC6FF" opacity=".95" />
                        <path d="M137 135 L299 143 L294 177 L132 168 Z" fill="url(#giftBlueLid)" />
                        <path d="M278 142 L299 143 L294 177 L274 176 Z" fill="#102F7A" opacity=".55" />
                        <path d="M132 136 L149 137 L145 167 L132 168 Z" fill="#FFFFFF" opacity=".08" />
                        <path d="M196 127 L221 129 L220 173 L194 171 Z" fill="url(#giftGold)" />
                        <path d="M201 128 L208 129 L207 171 L200 170 Z" fill="#FFF5BC" opacity=".62" />

                        <g className="gift-svg-bow" filter="url(#giftTinyShadow)">
                          <path className="gift-svg-bow-left" d="M204 126 C179 100 143 94 140 112 C138 128 172 135 201 131 C174 126 164 116 171 108 C178 99 194 109 210 127 Z" fill="url(#giftGoldSoft)" />
                          <path className="gift-svg-bow-right" d="M217 127 C243 102 278 99 281 117 C283 132 250 137 221 132 C248 128 257 118 250 110 C243 101 228 110 211 127 Z" fill="url(#giftGoldSoft)" />
                          <path d="M205 128 C184 111 177 82 190 76 C202 70 212 101 212 123 C214 101 225 70 238 77 C251 84 240 113 219 129 Z" fill="url(#giftGold)" />
                          <path d="M198 122 Q210 113 224 123 L220 139 Q210 145 199 137 Z" fill="url(#giftGoldSoft)" />
                          <path d="M202 136 L191 166 L209 155 L213 175 L227 138 Z" fill="url(#giftGold)" />
                          <path d="M202 124 L208 121 L211 137 L205 139 Z" fill="#FFF5BB" opacity=".55" />
                        </g>
                      </g>
                    </g>

                    <g className="gift-svg-stage">
                      <ellipse cx="210" cy="239" rx="112" ry="27" fill="none" stroke="rgba(217,133,0,.15)" strokeWidth="15" />
                      <ellipse cx="210" cy="237" rx="110" ry="25" fill="none" stroke="url(#giftSwoosh)" strokeWidth="8" />
                      <path d="M105 237 C146 253 278 255 316 235" fill="none" stroke="#FFF5C7" strokeOpacity=".88" strokeWidth="2.4" strokeLinecap="round" />
                    </g>

                    <g className="gift-svg-coins" filter="url(#giftTinyShadow)">
                      <g className="gift-svg-coin gift-svg-coin-a" transform="translate(96 126)">
                        <ellipse rx="19" ry="17" fill="url(#giftGoldSoft)" transform="rotate(18)" />
                        <ellipse rx="13" ry="11" fill="none" stroke="#FFF3AE" strokeWidth="2.4" opacity=".9" transform="rotate(18)" />
                        <text y="5" textAnchor="middle" fill="#9A5600" fontSize="13" fontWeight="900">₫</text>
                      </g>
                      <g className="gift-svg-coin gift-svg-coin-b" transform="translate(330 129)">
                        <ellipse rx="19" ry="17" fill="url(#giftGoldSoft)" transform="rotate(-17)" />
                        <ellipse rx="13" ry="11" fill="none" stroke="#FFF3AE" strokeWidth="2.4" opacity=".9" transform="rotate(-17)" />
                        <text y="5" textAnchor="middle" fill="#9A5600" fontSize="13" fontWeight="900">₫</text>
                      </g>
                    </g>

                    <g className="gift-svg-sparkles">
                      <path className="gift-svg-spark gift-svg-spark-a" d="M333 44 l5 10 l10 5 l-10 5 l-5 10 l-5-10 l-10-5 l10-5Z" fill="#FFD82D" />
                      <path className="gift-svg-spark gift-svg-spark-b" d="M111 47 l4 8 l8 4 l-8 4 l-4 8 l-4-8 l-8-4 l8-4Z" fill="#FFF1A5" />
                      <path className="gift-svg-spark gift-svg-spark-c" d="M356 133 l3 7 l7 3 l-7 3 l-3 7 l-3-7 l-7-3 l7-3Z" fill="#FFF3A4" />
                      <path className="gift-svg-spark gift-svg-spark-d" d="M73 124 l3 7 l7 3 l-7 3 l-3 7 l-3-7 l-7-3 l7-3Z" fill="#FFD331" />
                    </g>

                    <g className="gift-svg-confetti">
                      <rect x="74" y="68" width="7" height="20" rx="2" fill="#F47C16" transform="rotate(-38 74 68)" />
                      <rect x="117" y="34" width="6" height="17" rx="2" fill="#FFB515" transform="rotate(-18 117 34)" />
                      <rect x="291" y="34" width="7" height="18" rx="2" fill="#2D73E9" transform="rotate(32 291 34)" />
                      <rect x="355" y="72" width="7" height="20" rx="2" fill="#2771EA" transform="rotate(35 355 72)" />
                      <rect x="106" y="154" width="7" height="18" rx="2" fill="#2C73EB" transform="rotate(46 106 154)" />
                      <rect x="319" y="160" width="7" height="18" rx="2" fill="#F28B19" transform="rotate(-31 319 160)" />
                      <rect x="131" y="183" width="6" height="17" rx="2" fill="#F6A316" transform="rotate(-17 131 183)" />
                      <rect x="285" y="185" width="6" height="17" rx="2" fill="#2E73E7" transform="rotate(22 285 185)" />
                      <rect x="157" y="67" width="6" height="15" rx="2" fill="#2E73E7" transform="rotate(-28 157 67)" />
                      <rect x="263" y="70" width="6" height="15" rx="2" fill="#F59817" transform="rotate(24 263 70)" />
                    </g>
                  </svg>

                  {boxStage === 'burst' &&
                    burstConfetti.map((item, i) => (
                      <span
                        key={i}
                        className="gift-confetti-piece gift-confetti-burst"
                        style={{
                          left: `${item.left}%`,
                          top: `${item.top}%`,
                          backgroundColor: item.color,
                          animationDelay: `${item.delay}ms`,
                          transform: `rotate(${item.rotate}deg)`,
                          '--gx': `${item.dx}px`,
                        } as React.CSSProperties}
                      />
                    ))}
                </div>

              </div>
              <h2 className="text-[18px] leading-[1.15] font-extrabold text-gray-800 mb-2 gift-anim-fadeup max-w-[320px]">{campaignTitleNode}</h2>
              {campaign.description && (
                <p className="text-[13px] leading-6 text-gray-500 mb-5 max-w-[315px] gift-anim-fadeup">{campaign.description}</p>
              )}
              <button
                onClick={handleOpenClick}
                disabled={phase === 'opening'}
                className="w-full max-w-[290px] bg-gradient-to-b from-[#FF6A3D] to-[#EE4D2D] hover:from-[#ff774d] hover:to-[#f35a34] text-white font-extrabold py-4 rounded-[22px] shadow-[0_14px_30px_rgba(238,77,45,.28)] transition-all disabled:opacity-70 flex items-center justify-center gap-2 text-[15px]"
              >
                {phase === 'opening' ? (
                  <><Loader2 size={18} className="animate-spin" /> Đang mở quà...</>
                ) : (
                  <><Gift size={18} /> {isLoggedIn ? 'Mở quà ngay' : 'Mở quà — Đăng nhập để nhận'}</>
                )}
              </button>
              <p className="text-[11px] text-gray-400 mt-3">Mỗi tài khoản được mở {campaign.max_opens_per_user} lần.</p>
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
