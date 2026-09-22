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
              <svg className="gift-card-edge-decor" viewBox="0 0 420 520" aria-hidden="true">
                <defs>
                  <linearGradient id="giftCardEdgeGold" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FFE9A0" stopOpacity=".72" />
                    <stop offset="28%" stopColor="#FFC43F" stopOpacity=".82" />
                    <stop offset="72%" stopColor="#EF9B08" stopOpacity=".76" />
                    <stop offset="100%" stopColor="#FFE9A0" stopOpacity=".60" />
                  </linearGradient>
                </defs>
                <path className="gift-card-edge-ribbon" d="M-28 310 C18 327 -4 357 25 388 C54 420 27 467 -15 526" />
                <path className="gift-card-edge-highlight" d="M-18 320 C15 331 4 353 23 376" />
                <path className="gift-card-edge-ribbon" d="M448 310 C402 327 424 357 395 388 C366 420 393 467 435 526" />
                <path className="gift-card-edge-highlight" d="M438 320 C405 331 416 353 397 376" />
              </svg>
              <div className="relative mb-5 flex flex-col items-center gift-premium-hero w-full">
                <div className="gift-premium-bg" />
                <div className="gift-premium-sheen" />
                <div className={`gift-box-wrap ${boxWrapAnimClass}`}>
                  <svg
                    className={`gift-scene-svg ${boxStage === 'burst' ? 'is-open' : 'is-closed'}`}
                    viewBox="0 0 420 280"
                    role="img"
                    aria-label="Hộp quà KIMSHOP"
                  >
                    <defs>
                      <radialGradient id="giftSceneBg" cx="50%" cy="43%" r="68%">
                        <stop offset="0%" stopColor="#fffdf4" />
                        <stop offset="38%" stopColor="#FFEFC1" />
                        <stop offset="72%" stopColor="#FFC95F" stopOpacity=".70" />
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
                      <linearGradient id="giftBlueCenter" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#1746A3" />
                        <stop offset="18%" stopColor="#4F87E7" />
                        <stop offset="42%" stopColor="#1C55BC" />
                        <stop offset="60%" stopColor="#83B1FA" />
                        <stop offset="74%" stopColor="#245CC4" />
                        <stop offset="100%" stopColor="#0C2E79" />
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
                      <filter id="giftGlowBlur" x="-80%" y="-80%" width="260%" height="260%">
                        <feGaussianBlur stdDeviation="7" />
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
                      <path d="M-2 216 C42 209 55 174 86 166 C114 159 127 193 153 187" fill="none" stroke="rgba(175,101,0,.12)" strokeWidth="21" strokeLinecap="round" />
                      <path d="M-2 216 C42 209 55 174 86 166 C114 159 127 193 153 187" fill="none" stroke="url(#giftSwoosh)" strokeWidth="15" strokeLinecap="round" />
                      <path d="M267 187 C296 180 310 157 334 165 C364 174 374 208 422 213" fill="none" stroke="rgba(175,101,0,.12)" strokeWidth="21" strokeLinecap="round" />
                      <path d="M267 187 C296 180 310 157 334 165 C364 174 374 208 422 213" fill="none" stroke="url(#giftSwoosh)" strokeWidth="15" strokeLinecap="round" />
                      <path d="M16 208 C52 201 69 181 91 174" fill="none" stroke="#FFF4C6" strokeOpacity=".84" strokeWidth="2.4" strokeLinecap="round" />
                      <path d="M331 168 C355 176 371 196 399 200" fill="none" stroke="#FFF4C6" strokeOpacity=".84" strokeWidth="2.4" strokeLinecap="round" />
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
                        <path d="M134 145 L151 153 L153 238 L137 231 Z" fill="#4E80DE" stroke="#6997EB" strokeWidth="1.4" />
                        <path d="M151 153 L273 153 L270 239 L153 238 Z" fill="url(#giftBlueFront)" stroke="#2453BA" strokeWidth="1.6" />
                        <path d="M273 153 L292 145 L287 231 L270 239 Z" fill="#0E2F7D" stroke="#173F96" strokeWidth="1.4" />
                        <path d="M134 145 L151 135 L275 135 L292 145 L273 156 L151 156 Z" fill="#78AAF7" stroke="#A6CBFF" strokeWidth="1.6" />

                        <path d="M167 153 H190 L189 237 L168 238 Z" fill="url(#giftGold)" stroke="#D89412" strokeWidth="1" />
                        <path d="M236 153 H259 L257 237 L235 238 Z" fill="url(#giftGold)" stroke="#D89412" strokeWidth="1" />
                        <path d="M173 155 H181 L180 235 H173 Z" fill="#FFF5BE" opacity=".62" />
                        <path d="M242 155 H250 L248 235 H241 Z" fill="#FFF5BE" opacity=".54" />

                        <path className="gift-svg-body-shine" d="M156 158 L156 232" fill="none" stroke="#EAF3FF" strokeWidth="2.2" strokeLinecap="round" opacity=".42" />
                        <path className="gift-svg-body-shine" d="M266 159 L264 232" fill="none" stroke="#7EAEFF" strokeWidth="1.6" strokeLinecap="round" opacity=".30" />
                        <path d="M217 188 l5 10 l10 5 l-10 5 l-5 10 l-5-10 l-10-5 l10-5Z" fill="#FFFFFF" opacity=".90" />
                      </g>

                      <g className="gift-gap-burst">
                        <path d="M158 154 L211 79 L266 154 Z" fill="url(#giftInnerBurst)" opacity=".84" />
                        <ellipse cx="211" cy="151" rx="78" ry="25" fill="url(#giftInnerBurst)" opacity=".98" />
                        <ellipse cx="211" cy="149" rx="45" ry="11" fill="#FFFCE6" opacity=".68" filter="url(#giftGlowBlur)" />
                      </g>

                      <g className="gift-svg-cavity">
                        <path d="M139 146 L154 137 H274 L289 146 L272 158 H154 Z" fill="url(#giftGoldSoft)" stroke="#D89A1C" strokeWidth="2.2" />
                        <path d="M155 147 L174 141 H254 L273 147 L255 154 H174 Z" fill="#18366F" />
                        <ellipse cx="212" cy="148" rx="53" ry="10" fill="url(#giftInnerBurst)" opacity=".98" />
                        <ellipse cx="212" cy="147" rx="30" ry="6" fill="#FFF9CA" opacity=".64" />
                      </g>

                      <g className="gift-svg-lid">
                        <path d="M120 112 L137 102 H291 L307 112 L291 122 H137 Z" fill="#91BEFF" stroke="#C6DFFF" strokeWidth="1.5" />
                        <path d="M137 122 L307 122 L302 151 L132 151 Z" fill="url(#giftBlueLid)" stroke="#2455BC" strokeWidth="1.5" />
                        <path d="M120 112 L137 122 L132 151 L118 142 Z" fill="#5387E7" stroke="#78A6F3" strokeWidth="1.3" />
                        <path d="M291 122 L307 112 L304 141 L302 151 Z" fill="#0C2D78" stroke="#153F97" strokeWidth="1.3" />

                        <path d="M164 112 H188 L187 151 H163 Z" fill="url(#giftGold)" stroke="#D89412" strokeWidth="1" />
                        <path d="M238 112 H262 L260 151 H237 Z" fill="url(#giftGold)" stroke="#D89412" strokeWidth="1" />
                        <path d="M171 114 H179 L178 149 H170 Z" fill="#FFF5BF" opacity=".62" />
                        <path d="M245 114 H253 L251 149 H244 Z" fill="#FFF5BF" opacity=".54" />

                        <path className="gift-svg-lid-shine" d="M142 125 H298" fill="none" stroke="#EDF6FF" strokeWidth="2.2" strokeLinecap="round" opacity=".40" />

                        <g className="gift-svg-bow" filter="url(#giftTinyShadow)">
                          <path className="gift-svg-bow-left" d="M208 111 C184 91 148 88 141 103 C134 118 169 128 202 120 C177 117 168 108 177 99 C186 90 201 99 214 114 Z" fill="url(#giftGoldSoft)" />
                          <path className="gift-svg-bow-right" d="M219 111 C243 91 279 88 286 103 C293 118 258 128 225 120 C250 117 259 108 250 99 C241 90 226 99 213 114 Z" fill="url(#giftGoldSoft)" />
                          <path d="M209 112 C198 98 198 79 207 74 C217 69 218 91 214 107 C220 90 228 69 238 75 C248 81 239 101 220 113 Z" fill="url(#giftGold)" />
                          <rect x="204" y="106" width="20" height="19" rx="6" fill="url(#giftGoldSoft)" />
                          <path d="M206 121 L198 147 L211 137 L216 157 L226 123 Z" fill="url(#giftGold)" />
                        </g>
                      </g>

                      <g className="gift-svg-closed-glints">
                        <path d="M221 184 l4 8 l8 4 l-8 4 l-4 8 l-4-8 l-8-4 l8-4Z" fill="#FFFFFF" opacity=".92" />
                        <path d="M148 176 l3 6 l6 3 l-6 3 l-3 6 l-3-6 l-6-3 l6-3Z" fill="#FFEBA0" opacity=".82" />
                      </g>
                    </g>

                    <g className="gift-svg-stage">
                      <ellipse cx="210" cy="251" rx="132" ry="31" fill="#FFD46A" opacity=".14" />
                      <ellipse cx="210" cy="249" rx="132" ry="31" fill="none" stroke="rgba(217,133,0,.14)" strokeWidth="16" />
                      <ellipse cx="210" cy="248" rx="129" ry="28" fill="none" stroke="url(#giftSwoosh)" strokeWidth="8" />
                      <path d="M88 247 C138 267 287 269 334 245" fill="none" stroke="#FFF5C7" strokeOpacity=".88" strokeWidth="2.4" strokeLinecap="round" />
                    </g>

                    <g className="gift-svg-coins" filter="url(#giftTinyShadow)">
                      <g className="gift-svg-coin gift-svg-coin-a" transform="translate(72 132)">
                        <ellipse rx="19" ry="17" fill="url(#giftGoldSoft)" transform="rotate(18)" />
                        <ellipse rx="13" ry="11" fill="none" stroke="#FFF3AE" strokeWidth="2.4" opacity=".9" transform="rotate(18)" />
                        <text y="5" textAnchor="middle" fill="#9A5600" fontSize="13" fontWeight="900">₫</text>
                      </g>
                      <g className="gift-svg-coin gift-svg-coin-b" transform="translate(350 135)">
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
                      <path className="gift-svg-spark gift-svg-spark-e" d="M312 184 l4 8 l8 4 l-8 4 l-4 8 l-4-8 l-8-4 l8-4Z" fill="#FFFFFF" opacity=".92" />
                      <path className="gift-svg-spark gift-svg-spark-f" d="M101 92 l4 8 l8 4 l-8 4 l-4 8 l-4-8 l-8-4 l8-4Z" fill="#FFFFFF" opacity=".86" />
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
