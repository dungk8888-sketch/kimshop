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
              <div className="relative mb-5 flex flex-col items-center gift-premium-hero w-full">
                <div className="gift-premium-bg" />
                <div className="gift-premium-sheen" />
                <svg className="gift-card-ribbons" viewBox="0 0 420 520" aria-hidden="true">
                  <defs>
                    <linearGradient id="giftCardRibbonGold" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#FFE997" stopOpacity=".92" />
                      <stop offset="34%" stopColor="#FFC43D" stopOpacity=".9" />
                      <stop offset="70%" stopColor="#F3A20E" stopOpacity=".86" />
                      <stop offset="100%" stopColor="#FFF1B4" stopOpacity=".72" />
                    </linearGradient>
                  </defs>
                  <path className="gift-card-ribbon gift-card-ribbon-left" d="M-8 410 C35 374 56 418 35 458 C17 493 27 520 58 535" />
                  <path className="gift-card-ribbon gift-card-ribbon-right" d="M428 398 C386 372 366 414 386 453 C404 488 397 516 368 538" />
                </svg>
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
                      <linearGradient id="giftBlueFront" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#7fb3ff" />
                        <stop offset="25%" stopColor="#3f7cf2" />
                        <stop offset="62%" stopColor="#2054c9" />
                        <stop offset="100%" stopColor="#102e80" />
                      </linearGradient>
                      <linearGradient id="giftBlueSide" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#315fc7" />
                        <stop offset="100%" stopColor="#0b2369" />
                      </linearGradient>
                      <linearGradient id="giftBlueLid" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#9ac6ff" />
                        <stop offset="24%" stopColor="#5e94fb" />
                        <stop offset="62%" stopColor="#2c63db" />
                        <stop offset="100%" stopColor="#15388d" />
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
                        <path d="M145 143 H275 V226 Q275 239 262 242 H158 Q145 239 145 226 Z" fill="url(#giftBlueFront)" />
                        <path d="M145 143 L160 132 H260 L275 143 L259 153 H160 Z" fill="#6E9BFA" opacity=".9" />
                        <path d="M253 145 H275 V226 Q275 238 263 241 H253 Z" fill="url(#giftBlueSide)" opacity=".92" />
                        <path d="M152 151 H194 V226 Q194 235 185 238 H160 Q152 236 152 227 Z" fill="#fff" opacity=".10" />
                        <rect x="198" y="143" width="24" height="98" fill="url(#giftGold)" />
                        <path d="M204 145 H211 V239 H204 Z" fill="#FFF7C9" opacity=".62" />
                        <path d="M145 174 H275 V196 H145 Z" fill="url(#giftGoldSoft)" />
                        <path d="M147 175 H273 V181 H147 Z" fill="#FFF3A4" opacity=".54" />
                        <path d="M259 196 H275 V226 Q274 236 265 240 H259 Z" fill="#73500B" opacity=".12" />
                      </g>

                      <g className="gift-svg-cavity">
                        <ellipse cx="210" cy="143" rx="61" ry="15" fill="#102D70" opacity=".9" />
                        <ellipse cx="210" cy="141" rx="58" ry="12" fill="#071D55" opacity=".72" stroke="url(#giftGoldSoft)" strokeWidth="4" />
                        <ellipse cx="210" cy="139" rx="48" ry="9" fill="url(#giftInnerBurst)" opacity=".9" />
                        <ellipse cx="210" cy="139" rx="34" ry="6" fill="#FFFDEB" opacity=".96" />
                      </g>

                      <g className="gift-svg-lid">
                        <rect x="125" y="106" width="170" height="45" rx="9" fill="url(#giftBlueLid)" />
                        <path d="M135 99 H285 Q293 99 296 107 H124 Q127 99 135 99Z" fill="#A8CFFF" opacity=".9" />
                        <path d="M280 107 H295 V143 Q294 150 286 151 H280 Z" fill="#123579" opacity=".5" />
                        <rect x="198" y="99" width="25" height="52" fill="url(#giftGold)" />
                        <path d="M205 101 H212 V149 H205 Z" fill="#FFF8D2" opacity=".64" />
                        <path d="M128 108 H292 V115 H128 Z" fill="#FFF" opacity=".12" />

                        <g className="gift-svg-bow" filter="url(#giftTinyShadow)">
                          <path className="gift-svg-bow-left" d="M204 101 C180 76 145 72 142 90 C140 105 173 111 201 108 C174 103 165 94 171 87 C178 78 193 87 210 103 Z" fill="url(#giftGoldSoft)" />
                          <path className="gift-svg-bow-right" d="M217 101 C241 76 276 72 279 90 C281 105 248 111 220 108 C247 103 256 94 250 87 C243 78 228 87 211 103 Z" fill="url(#giftGoldSoft)" />
                          <path d="M205 103 C185 88 177 61 189 55 C202 49 211 77 212 98 C214 77 224 48 237 55 C250 62 239 90 219 104 Z" fill="url(#giftGold)" />
                          <rect x="201" y="94" width="22" height="22" rx="8" fill="url(#giftGoldSoft)" />
                          <path d="M204 111 L193 145 L210 133 L213 155 L226 111 Z" fill="url(#giftGold)" />
                          <path d="M205 97 H211 V111 H205 Z" fill="#FFF7C7" opacity=".55" />
                        </g>
                      </g>
                    </g>

                    <g className="gift-svg-swoosh-front">
                      <path d="M18 184 C77 240 145 245 192 216 M238 219 C298 248 364 221 404 176" fill="none" stroke="rgba(158,88,0,.13)" strokeWidth="17" strokeLinecap="round" />
                      <path d="M18 184 C77 240 145 245 192 216 M238 219 C298 248 364 221 404 176" fill="none" stroke="url(#giftSwoosh)" strokeWidth="9" strokeLinecap="round" />
                      <path d="M34 188 C88 226 145 232 190 211 M241 214 C297 235 352 215 389 181" fill="none" stroke="#fff4c8" strokeOpacity=".84" strokeWidth="2" strokeLinecap="round" />
                    </g>

                    <g className="gift-svg-badges" filter="url(#giftTinyShadow)">
                      <g className="gift-svg-badge-percent">
                        <rect x="65" y="70" width="49" height="44" rx="11" fill="#FF4E37" />
                        <rect x="69" y="74" width="41" height="36" rx="9" fill="#FF745F" opacity=".58" />
                        <text x="89.5" y="100" textAnchor="middle" fill="#fff" fontWeight="900" fontSize="23">%</text>
                      </g>
                      <g className="gift-svg-badge-fs">
                        <rect x="307" y="74" width="50" height="44" rx="11" fill="#2867E8" />
                        <rect x="311" y="78" width="42" height="36" rx="9" fill="#5891FF" opacity=".66" />
                        <text x="332" y="101" textAnchor="middle" fill="#fff" fontWeight="900" fontSize="18">FS</text>
                      </g>
                    </g>

                    <g className="gift-svg-coins" filter="url(#giftTinyShadow)">
                      <g className="gift-svg-coin gift-svg-coin-a" transform="translate(91 151)">
                        <circle r="16" fill="url(#giftGoldSoft)" />
                        <circle r="11" fill="none" stroke="#FFF3AE" strokeWidth="2" opacity=".86" />
                        <text y="5" textAnchor="middle" fill="#8D4C00" fontSize="12" fontWeight="900">₫</text>
                      </g>
                      <g className="gift-svg-coin gift-svg-coin-b" transform="translate(333 151)">
                        <circle r="15" fill="url(#giftGoldSoft)" />
                        <circle r="10" fill="none" stroke="#FFF3AE" strokeWidth="2" opacity=".86" />
                        <text y="5" textAnchor="middle" fill="#8D4C00" fontSize="11" fontWeight="900">₫</text>
                      </g>
                      <g className="gift-svg-coin gift-svg-coin-c" transform="translate(125 211)">
                        <circle r="12" fill="url(#giftGoldSoft)" />
                        <circle r="8" fill="none" stroke="#FFF3AE" strokeWidth="1.8" opacity=".82" />
                        <text y="4" textAnchor="middle" fill="#8D4C00" fontSize="9" fontWeight="900">₫</text>
                      </g>
                      <g className="gift-svg-coin gift-svg-coin-d" transform="translate(304 211)">
                        <circle r="12" fill="url(#giftGoldSoft)" />
                        <circle r="8" fill="none" stroke="#FFF3AE" strokeWidth="1.8" opacity=".82" />
                        <text y="4" textAnchor="middle" fill="#8D4C00" fontSize="9" fontWeight="900">₫</text>
                      </g>
                    </g>

                    <g className="gift-svg-sparkles">
                      <path className="gift-svg-spark gift-svg-spark-a" d="M333 44 l5 10 l10 5 l-10 5 l-5 10 l-5-10 l-10-5 l10-5Z" fill="#FFD82D" />
                      <path className="gift-svg-spark gift-svg-spark-b" d="M111 47 l4 8 l8 4 l-8 4 l-4 8 l-4-8 l-8-4 l8-4Z" fill="#FFF1A5" />
                      <path className="gift-svg-spark gift-svg-spark-c" d="M356 133 l3 7 l7 3 l-7 3 l-3 7 l-3-7 l-7-3 l7-3Z" fill="#FFF3A4" />
                      <path className="gift-svg-spark gift-svg-spark-d" d="M73 124 l3 7 l7 3 l-7 3 l-3 7 l-3-7 l-7-3 l7-3Z" fill="#FFD331" />
                    </g>

                    <g className="gift-svg-confetti">
                      <rect x="116" y="31" width="7" height="18" rx="2" fill="#FF8A24" transform="rotate(-24 116 31)" />
                      <rect x="287" y="31" width="7" height="18" rx="2" fill="#2C73ED" transform="rotate(24 287 31)" />
                      <rect x="66" y="111" width="8" height="20" rx="2" fill="#FFD132" transform="rotate(18 66 111)" />
                      <rect x="354" y="112" width="8" height="20" rx="2" fill="#FF7D22" transform="rotate(-8 354 112)" />
                      <rect x="253" y="19" width="6" height="15" rx="2" fill="#FFD22E" transform="rotate(14 253 19)" />
                      <rect x="146" y="65" width="6" height="15" rx="2" fill="#2E75EE" transform="rotate(-26 146 65)" />
                      <rect x="278" y="66" width="6" height="15" rx="2" fill="#FF9A24" transform="rotate(28 278 66)" />
                      <rect x="102" y="191" width="7" height="17" rx="2" fill="#2D72E9" transform="rotate(-38 102 191)" />
                      <rect x="321" y="192" width="7" height="17" rx="2" fill="#FF8120" transform="rotate(35 321 192)" />
                      <circle cx="122" cy="119" r="4" fill="#FFD32D" />
                      <circle cx="298" cy="124" r="4" fill="#FF7E24" />
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
