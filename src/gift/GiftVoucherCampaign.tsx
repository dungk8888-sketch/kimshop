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
                      <linearGradient id="giftBlueFront" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#4A83EE" />
                        <stop offset="45%" stopColor="#2D69DC" />
                        <stop offset="100%" stopColor="#1C4DB8" />
                      </linearGradient>
                      <linearGradient id="giftBlueGloss" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#FFFFFF" stopOpacity=".10" />
                        <stop offset="26%" stopColor="#FFFFFF" stopOpacity=".34" />
                        <stop offset="48%" stopColor="#FFFFFF" stopOpacity=".05" />
                        <stop offset="75%" stopColor="#8CB7FF" stopOpacity=".16" />
                        <stop offset="100%" stopColor="#0B2E79" stopOpacity=".20" />
                      </linearGradient>
                      <linearGradient id="giftLidTopGloss" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#C9E3FF" stopOpacity=".92" />
                        <stop offset="100%" stopColor="#5F96EF" stopOpacity=".16" />
                      </linearGradient>
                      <linearGradient id="giftEdgeSpecular" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#FFFFFF" stopOpacity=".15" />
                        <stop offset="25%" stopColor="#FFFFFF" stopOpacity=".72" />
                        <stop offset="55%" stopColor="#FFFFFF" stopOpacity=".22" />
                        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="giftEdgeDark" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#061B54" stopOpacity="0" />
                        <stop offset="55%" stopColor="#061B54" stopOpacity=".12" />
                        <stop offset="100%" stopColor="#061B54" stopOpacity=".42" />
                      </linearGradient>
                      <linearGradient id="giftGoldSpecular" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#FFF8D2" stopOpacity="0" />
                        <stop offset="45%" stopColor="#FFF8D2" stopOpacity=".78" />
                        <stop offset="62%" stopColor="#FFFFFF" stopOpacity=".96" />
                        <stop offset="100%" stopColor="#FFF8D2" stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="giftGoldMetal" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#9A5600" />
                        <stop offset="10%" stopColor="#CE8508" />
                        <stop offset="28%" stopColor="#F1B72E" />
                        <stop offset="47%" stopColor="#FFE58D" />
                        <stop offset="55%" stopColor="#FFF8C8" />
                        <stop offset="68%" stopColor="#F6C43D" />
                        <stop offset="84%" stopColor="#D68A09" />
                        <stop offset="100%" stopColor="#8B4B00" />
                      </linearGradient>
                      <filter id="giftMaterialDepth" x="-40%" y="-40%" width="180%" height="200%">
                        <feDropShadow dx="0" dy="2" stdDeviation="1.4" floodColor="#0A1B4D" floodOpacity=".28" />
                        <feDropShadow dx="0" dy="9" stdDeviation="7" floodColor="#08163D" floodOpacity=".18" />
                      </filter>
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
                      <linearGradient id="giftBlueLid" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#4A86F0" />
                        <stop offset="48%" stopColor="#2D69DD" />
                        <stop offset="100%" stopColor="#1B4CB6" />
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
                      <linearGradient id="giftBowMetal" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#FFF4BE" />
                        <stop offset="16%" stopColor="#FFD85E" />
                        <stop offset="38%" stopColor="#F2A51A" />
                        <stop offset="56%" stopColor="#FFE88D" />
                        <stop offset="72%" stopColor="#C87906" />
                        <stop offset="100%" stopColor="#F6BB2D" />
                      </linearGradient>
                      <linearGradient id="giftBodyBottomShade" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#071B52" stopOpacity="0" />
                        <stop offset="100%" stopColor="#071B52" stopOpacity=".30" />
                      </linearGradient>
                      <linearGradient id="giftFaceDepth" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#C3DEFF" stopOpacity=".54" />
                        <stop offset="32%" stopColor="#3375DC" stopOpacity=".06" />
                        <stop offset="100%" stopColor="#061B62" stopOpacity=".38" />
                      </linearGradient>
                      <linearGradient id="giftOrbitFront" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#F7A40E" stopOpacity="0" />
                        <stop offset="22%" stopColor="#FFD45F" stopOpacity=".68" />
                        <stop offset="52%" stopColor="#FFF9D5" stopOpacity=".96" />
                        <stop offset="82%" stopColor="#FFC146" stopOpacity=".75" />
                        <stop offset="100%" stopColor="#F7A40E" stopOpacity="0" />
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
                    {/* Rear half of the orbit sits behind the box. */}
                    <g className="gift-svg-orbit-back" fill="none" strokeLinecap="round">
                      <path d="M76 184 C94 130 161 116 211 116 C276 116 332 137 345 184" stroke="#FFB832" strokeOpacity=".24" strokeWidth="11" filter="url(#giftGlowBlur)" />
                      <path d="M76 184 C94 130 161 116 211 116 C276 116 332 137 345 184" stroke="url(#giftOrbitFront)" strokeOpacity=".68" strokeWidth="3" />
                    </g>

                    <g className="gift-svg-open-glow">
                      <circle cx="210" cy="139" r="108" fill="url(#giftInnerBurst)" />
                      <path d="M210 139 L156 22 L190 36 Z" fill="#fff8c7" opacity=".68" />
                      <path d="M210 139 L252 18 L272 42 Z" fill="#fff2a3" opacity=".56" />
                      <path d="M210 139 L99 62 L126 54 Z" fill="#fff8cf" opacity=".36" />
                      <path d="M210 139 L320 55 L335 78 Z" fill="#fff4ad" opacity=".34" />
                    </g>

                    <g className="gift-svg-ambient" pointerEvents="none">
                      <g className="gift-svg-ambient-halo">
                        <ellipse cx="210" cy="142" rx="142" ry="94" fill="none" stroke="#FFE8A4" strokeOpacity=".22" strokeWidth="2" />
                        <ellipse cx="210" cy="142" rx="124" ry="78" fill="none" stroke="#FFFFFF" strokeOpacity=".15" strokeWidth="1.2" />
                      </g>

                      <g className="gift-svg-ambient-badge gift-svg-ambient-sale" transform="translate(88 88) rotate(-9)">
                        <rect x="-21" y="-18" width="42" height="36" rx="10" fill="#F64C38" />
                        <rect x="-17" y="-14" width="34" height="8" rx="4" fill="#FF8A78" opacity=".42" />
                        <text y="7" textAnchor="middle" fill="#FFFFFF" fontSize="18" fontWeight="900">%</text>
                      </g>

                      <g className="gift-svg-ambient-badge gift-svg-ambient-fs" transform="translate(332 90) rotate(8)">
                        <rect x="-22" y="-18" width="44" height="36" rx="10" fill="#2E6EE8" />
                        <rect x="-18" y="-14" width="36" height="8" rx="4" fill="#77A8FF" opacity=".42" />
                        <text y="6" textAnchor="middle" fill="#FFFFFF" fontSize="15" fontWeight="900">Fs</text>
                      </g>

                      <g className="gift-svg-ambient-coin gift-svg-ambient-coin-a" transform="translate(108 143) rotate(-14)">
                        <ellipse rx="16" ry="14" fill="url(#giftGoldSoft)" />
                        <ellipse rx="11" ry="9" fill="none" stroke="#FFF4AF" strokeWidth="2" opacity=".9" />
                        <path d="M-5 -8 C-1 -12 8 -10 11 -4" fill="none" stroke="#FFFFFF" strokeOpacity=".54" strokeWidth="2" strokeLinecap="round" />
                        <text y="4" textAnchor="middle" fill="#995500" fontSize="11" fontWeight="900">₫</text>
                      </g>

                      <g className="gift-svg-ambient-coin gift-svg-ambient-coin-b" transform="translate(315 146) rotate(15)">
                        <ellipse rx="16" ry="14" fill="url(#giftGoldSoft)" />
                        <ellipse rx="11" ry="9" fill="none" stroke="#FFF4AF" strokeWidth="2" opacity=".9" />
                        <path d="M-5 -8 C-1 -12 8 -10 11 -4" fill="none" stroke="#FFFFFF" strokeOpacity=".54" strokeWidth="2" strokeLinecap="round" />
                        <text y="4" textAnchor="middle" fill="#995500" fontSize="11" fontWeight="900">₫</text>
                      </g>

                      <g className="gift-svg-ambient-coin gift-svg-ambient-coin-c" transform="translate(142 67) rotate(8)">
                        <ellipse rx="10" ry="9" fill="url(#giftGoldSoft)" />
                        <ellipse rx="6.5" ry="5.5" fill="none" stroke="#FFF4AF" strokeWidth="1.4" opacity=".88" />
                        <text y="3" textAnchor="middle" fill="#995500" fontSize="7" fontWeight="900">₫</text>
                      </g>

                      <g className="gift-svg-ambient-coin gift-svg-ambient-coin-d" transform="translate(279 66) rotate(-9)">
                        <ellipse rx="10" ry="9" fill="url(#giftGoldSoft)" />
                        <ellipse rx="6.5" ry="5.5" fill="none" stroke="#FFF4AF" strokeWidth="1.4" opacity=".88" />
                        <text y="3" textAnchor="middle" fill="#995500" fontSize="7" fontWeight="900">₫</text>
                      </g>

                      <g className="gift-svg-ambient-coin gift-svg-ambient-coin-e" transform="translate(82 174) rotate(18)">
                        <ellipse rx="9" ry="8" fill="url(#giftGoldSoft)" />
                        <ellipse rx="5.8" ry="4.8" fill="none" stroke="#FFF4AF" strokeWidth="1.3" opacity=".88" />
                        <text y="2.5" textAnchor="middle" fill="#995500" fontSize="6.5" fontWeight="900">₫</text>
                      </g>

                      <g className="gift-svg-ambient-coin gift-svg-ambient-coin-f" transform="translate(343 173) rotate(-16)">
                        <ellipse rx="9" ry="8" fill="url(#giftGoldSoft)" />
                        <ellipse rx="5.8" ry="4.8" fill="none" stroke="#FFF4AF" strokeWidth="1.3" opacity=".88" />
                        <text y="2.5" textAnchor="middle" fill="#995500" fontSize="6.5" fontWeight="900">₫</text>
                      </g>

                      <g className="gift-svg-ambient-stars">
                        <path className="gift-svg-ambient-star gift-svg-ambient-star-a" d="M118 105 l4 9 l9 4 l-9 4 l-4 9 l-4-9 l-9-4 l9-4Z" fill="#FFF8D3" />
                        <path className="gift-svg-ambient-star gift-svg-ambient-star-b" d="M303 111 l4 9 l9 4 l-9 4 l-4 9 l-4-9 l-9-4 l9-4Z" fill="#FFE35A" />
                        <path className="gift-svg-ambient-star gift-svg-ambient-star-c" d="M145 199 l3 7 l7 3 l-7 3 l-3 7 l-3-7 l-7-3 l7-3Z" fill="#FFFFFF" />
                        <path className="gift-svg-ambient-star gift-svg-ambient-star-d" d="M282 202 l3 7 l7 3 l-7 3 l-3 7 l-3-7 l-7-3 l7-3Z" fill="#FFF1A4" />
                        <path className="gift-svg-ambient-star gift-svg-ambient-star-e" d="M87 118 l3 7 l7 3 l-7 3 l-3 7 l-3-7 l-7-3 l7-3Z" fill="#FFE76D" />
                        <path className="gift-svg-ambient-star gift-svg-ambient-star-f" d="M334 119 l3 7 l7 3 l-7 3 l-3 7 l-3-7 l-7-3 l7-3Z" fill="#FFFFFF" opacity=".94" />
                        <circle className="gift-svg-ambient-dot gift-svg-ambient-dot-a" cx="95" cy="180" r="3" fill="#F6A316" />
                        <circle className="gift-svg-ambient-dot gift-svg-ambient-dot-b" cx="326" cy="183" r="3" fill="#2E73E7" />
                        <rect className="gift-svg-ambient-confetti gift-svg-ambient-confetti-a" x="102" y="72" width="6" height="16" rx="2" fill="#F47C16" transform="rotate(-28 102 72)" />
                        <rect className="gift-svg-ambient-confetti gift-svg-ambient-confetti-b" x="315" y="71" width="6" height="16" rx="2" fill="#2D73E9" transform="rotate(28 315 71)" />
                        <rect className="gift-svg-ambient-confetti gift-svg-ambient-confetti-c" x="147" y="88" width="5" height="13" rx="2" fill="#2D73E9" transform="rotate(-18 147 88)" />
                        <rect className="gift-svg-ambient-confetti gift-svg-ambient-confetti-d" x="270" y="88" width="5" height="13" rx="2" fill="#F49A17" transform="rotate(20 270 88)" />
                      </g>
                    </g>

                    <g className="gift-svg-box">
                      <g className="gift-svg-body">
                        <rect x="124" y="156" width="176" height="80" rx="8" fill="url(#giftBlueFront)" stroke="#194BAE" strokeWidth="1.45" />
                        <path d="M126 166 Q126 158 135 158 H156 V231 Q141 236 126 226 Z" fill="#87B6FC" opacity=".30" />
                        <path d="M267 157 H290 Q300 157 300 166 V226 Q300 236 290 236 H267 Z" fill="#061F66" opacity=".36" />
                        <path d="M126 167 Q126 158 135 158 H292 Q299 158 299 165 V226 Q299 235 291 235 H135 Q126 235 126 226 Z" fill="url(#giftFaceDepth)" opacity=".54" />
                        <path d="M136 160 H285" fill="none" stroke="#E7F4FF" strokeOpacity=".58" strokeWidth="2" strokeLinecap="round" />
                        <path d="M124 164 Q124 156 132 156 H160 V236 H132 Q124 236 124 228 Z" fill="#76A4F4" opacity=".18" />
                        <rect x="160" y="156" width="104" height="80" fill="#215ACB" opacity=".08" />
                        <path d="M264 156 H292 Q300 156 300 164 V228 Q300 236 292 236 H264 Z" fill="#0B2C77" opacity=".18" />
                        <rect x="124" y="156" width="176" height="80" rx="8" fill="url(#giftBlueGloss)" opacity=".76" />
                        <path d="M126 165 Q126 157 134 157 H149 L143 233 H134 Q126 233 126 225 Z" fill="#D8ECFF" opacity=".18" />
                        <path d="M277 157 H291 Q300 157 300 166 V226 Q300 235 291 235 H277 L284 225 V168 Z" fill="#06194F" opacity=".34" />
                        <path d="M280 162 V226" fill="none" stroke="#9CBFFF" strokeOpacity=".19" strokeWidth="1.5" />
                        <path className="gift-svg-body-edge-light" d="M133 157 H291 Q298 157 299 165" fill="none" stroke="url(#giftEdgeSpecular)" strokeWidth="2.4" strokeLinecap="round" />
                        <path className="gift-svg-body-edge-dark" d="M299 166 V226 Q299 235 290 235 H134" fill="none" stroke="url(#giftEdgeDark)" strokeWidth="2.2" strokeLinecap="round" />
                        <path className="gift-svg-body-contact" d="M140 235 H284" fill="none" stroke="#07173E" strokeOpacity=".22" strokeWidth="3.2" strokeLinecap="round" />
                        <rect className="gift-svg-body-inner-bevel" x="128" y="160" width="168" height="72" rx="6" fill="none" stroke="#EAF3FF" strokeOpacity=".10" strokeWidth="1.2" />
                        <path className="gift-svg-body-inner-dark" d="M294 166 V225 Q294 231 288 232 H136" fill="none" stroke="#061A50" strokeOpacity=".18" strokeWidth="1.8" strokeLinecap="round" />
                        <path className="gift-svg-body-top-soft" d="M136 161 H288" fill="none" stroke="#FFFFFF" strokeOpacity=".15" strokeWidth="1.2" strokeLinecap="round" />
                        <path className="gift-svg-body-soft-spec" d="M136 165 C151 160 169 160 184 164 V226 C167 230 151 229 136 223 Z" fill="#FFFFFF" opacity=".055" />
                        <path className="gift-svg-body-right-depth" d="M270 160 H290 Q296 160 296 167 V226 Q296 232 289 232 H270 Z" fill="#041B55" opacity=".13" />
                        <path className="gift-svg-body-bottom-shade" d="M128 211 H296 V226 Q296 234 288 234 H136 Q128 234 128 226 Z" fill="url(#giftBodyBottomShade)" />
                        <path className="gift-svg-corner-light-left" d="M129 168 Q129 160 137 160" fill="none" stroke="#FFFFFF" strokeOpacity=".36" strokeWidth="1.6" strokeLinecap="round" />
                        <path className="gift-svg-corner-dark-right" d="M295 168 V226 Q295 233 288 233" fill="none" stroke="#061947" strokeOpacity=".30" strokeWidth="1.6" strokeLinecap="round" />
                        <path className="gift-svg-body-lower-bevel" d="M132 224 Q133 234 143 234 H282 Q292 234 293 224" fill="none" stroke="#06194A" strokeOpacity=".22" strokeWidth="2.1" strokeLinecap="round" />

                        <rect x="158" y="156" width="18" height="80" rx="4" fill="url(#giftGoldMetal)" />
                        <rect x="248" y="156" width="18" height="80" rx="4" fill="url(#giftGoldMetal)" />
                        <rect x="163" y="159" width="5" height="74" rx="2.5" fill="#FFF4B7" opacity=".56" />
                        <rect x="253" y="159" width="5" height="74" rx="2.5" fill="#FFF4B7" opacity=".48" />
                        <rect className="gift-svg-gold-spec" x="166" y="156" width="8" height="80" rx="4" fill="url(#giftGoldSpecular)" opacity=".52" />
                        <rect className="gift-svg-gold-spec" x="256" y="156" width="8" height="80" rx="4" fill="url(#giftGoldSpecular)" opacity=".45" />
                        <rect className="gift-svg-ribbon-shadow" x="174" y="158" width="3.5" height="76" rx="1.75" fill="#713A00" opacity=".18" />
                        <rect className="gift-svg-ribbon-shadow" x="264" y="158" width="3.5" height="76" rx="1.75" fill="#713A00" opacity=".16" />
                        <path className="gift-svg-ribbon-curve" d="M161 164 C165 184 164 208 162 228" fill="none" stroke="#FFF7D5" strokeOpacity=".30" strokeWidth="1.3" strokeLinecap="round" />
                        <path className="gift-svg-ribbon-curve" d="M251 164 C255 184 254 208 252 228" fill="none" stroke="#FFF7D5" strokeOpacity=".26" strokeWidth="1.3" strokeLinecap="round" />
                        <path className="gift-svg-ribbon-edge-dark" d="M176 160 V232" fill="none" stroke="#744000" strokeOpacity=".16" strokeWidth="1.2" />
                        <path className="gift-svg-ribbon-edge-dark" d="M266 160 V232" fill="none" stroke="#744000" strokeOpacity=".14" strokeWidth="1.2" />
                        <path className="gift-svg-ribbon-ao" d="M157 160 V232" fill="none" stroke="#071947" strokeOpacity=".16" strokeWidth="1.4" />
                        <path className="gift-svg-ribbon-ao" d="M177 160 V232" fill="none" stroke="#071947" strokeOpacity=".15" strokeWidth="1.2" />
                        <path className="gift-svg-ribbon-ao" d="M247 160 V232" fill="none" stroke="#071947" strokeOpacity=".14" strokeWidth="1.2" />
                        <path className="gift-svg-ribbon-ao" d="M267 160 V232" fill="none" stroke="#071947" strokeOpacity=".16" strokeWidth="1.4" />

                        <path className="gift-svg-body-shine" d="M134 165 V226" fill="none" stroke="#F1F7FF" strokeWidth="2.1" strokeLinecap="round" opacity=".28" />
                        <path className="gift-svg-body-shine" d="M290 165 V226" fill="none" stroke="#82AEFF" strokeWidth="1.2" strokeLinecap="round" opacity=".12" />
                        <path d="M214 184 l5 10 l10 5 l-10 5 l-5 10 l-5-10 l-10-5 l10-5Z" fill="#FFFFFF" opacity=".92" />
                        <path d="M143 176 l3 6 l6 3 l-6 3 l-3 6 l-3-6 l-6-3 l6-3Z" fill="#FFECA5" opacity=".82" />
                      </g>

                      <g className="gift-gap-burst">
                        <path d="M154 157 L212 90 L270 157 Z" fill="url(#giftInnerBurst)" opacity=".88" />
                        <ellipse cx="212" cy="153" rx="81" ry="22" fill="url(#giftInnerBurst)" opacity=".98" />
                        <ellipse cx="212" cy="151" rx="46" ry="10" fill="#FFFBE2" opacity=".68" filter="url(#giftGlowBlur)" />
                      </g>

                      <g className="gift-svg-cavity">
                        <path d="M130 157 Q130 152 136 149 L153 142 H281 Q286 142 290 145 L301 152 Q305 155 300 158 L289 163 H153 Q146 163 142 160 Z" fill="url(#giftGoldSoft)" opacity=".98" />
                        <path d="M154 154 L175 147 H260 L281 155 L261 161 H175 Z" fill="#1F3D78" opacity=".94" />
                        <ellipse cx="212" cy="155" rx="56" ry="10.5" fill="url(#giftInnerBurst)" opacity=".98" />
                        <ellipse cx="212" cy="153" rx="31" ry="6" fill="#FFF8C6" opacity=".66" />
                      </g>

                      <path className="gift-svg-closed-seam" d="M128 158 C161 162 263 162 301 158" fill="none" stroke="#071C55" strokeOpacity=".34" strokeWidth="4.2" strokeLinecap="round" filter="url(#giftSoftShadow)" />
                      <path className="gift-svg-body-top-glint" d="M134 159 C166 157 259 157 293 159" fill="none" stroke="#DCEAFF" strokeOpacity=".42" strokeWidth="1.4" strokeLinecap="round" />
                      <path className="gift-svg-body-bottom-rim" d="M134 233 C170 236 256 236 290 233" fill="none" stroke="#061A4D" strokeOpacity=".20" strokeWidth="1.5" strokeLinecap="round" />

                      <g className="gift-svg-lid">
                        <path className="gift-svg-lid-top-plane" d="M116 120 L138 108 Q141 107 146 107 H279 Q285 107 289 110 L308 120 Z" fill="#467ED9" />
                        <path className="gift-svg-lid-top-plane-light" d="M139 110 H285 L301 119 H124 Z" fill="url(#giftLidTopGloss)" opacity=".80" />
                        <path className="gift-svg-lid-top-plane-rim" d="M123 118 L140 109 H281 L300 119" fill="none" stroke="#E6F2FF" strokeOpacity=".7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <rect x="116" y="120" width="192" height="38" rx="7" fill="url(#giftBlueLid)" stroke="#1C4DB2" strokeWidth="1.4" />
                        <path d="M124 120 H300 Q308 120 308 128 V132 H116 V128 Q116 120 124 120 Z" fill="url(#giftLidTopGloss)" opacity=".86" />
                        <path d="M116 132 H308 V151 Q308 158 301 158 H123 Q116 158 116 151 Z" fill="#0D3D9D" opacity=".11" />
                        <path d="M286 120 H300 Q308 120 308 128 V150 Q308 158 300 158 H286 Z" fill="#092B73" opacity=".18" />
                        <path d="M116 128 Q116 120 124 120 H140 V158 H124 Q116 158 116 150 Z" fill="#7DACF7" opacity=".15" />
                        <path className="gift-svg-lid-edge-light" d="M124 121 H300 Q307 121 307 128" fill="none" stroke="url(#giftEdgeSpecular)" strokeWidth="2.5" strokeLinecap="round" />
                        <path className="gift-svg-lid-edge-dark" d="M307 130 V149 Q307 157 299 157 H125" fill="none" stroke="url(#giftEdgeDark)" strokeWidth="2.2" strokeLinecap="round" />
                        <path className="gift-svg-lid-contact" d="M128 157 H296" fill="none" stroke="#07173E" strokeOpacity=".20" strokeWidth="2.8" strokeLinecap="round" />
                        <path className="gift-svg-lid-underlip" d="M122 151 Q122 157 129 157 H295 Q302 157 302 151 Z" fill="#071A52" opacity=".16" />
                        <path className="gift-svg-lid-lip-face" d="M121 149 H303 V153 Q303 159 296 159 H128 Q121 159 121 153 Z" fill="#082A79" opacity=".24" />
                        <path className="gift-svg-lid-left-spec" d="M124 124 Q124 121 129 121 H178" fill="none" stroke="#FFFFFF" strokeOpacity=".42" strokeWidth="1.8" strokeLinecap="round" />
                        <rect className="gift-svg-lid-inner-bevel" x="120" y="123" width="184" height="31" rx="5" fill="none" stroke="#EDF6FF" strokeOpacity=".10" strokeWidth="1.1" />

                        <rect x="153" y="120" width="21" height="38" rx="4" fill="url(#giftGoldMetal)" />
                        <rect x="250" y="120" width="21" height="38" rx="4" fill="url(#giftGoldMetal)" />
                        <rect x="159" y="123" width="6" height="32" rx="3" fill="#FFF5BF" opacity=".56" />
                        <rect x="256" y="123" width="6" height="32" rx="3" fill="#FFF5BF" opacity=".50" />
                        <rect className="gift-svg-lid-gold-spec" x="156" y="120" width="8" height="38" rx="4" fill="url(#giftGoldSpecular)" opacity=".50" />
                        <rect className="gift-svg-lid-gold-spec" x="253" y="120" width="8" height="38" rx="4" fill="url(#giftGoldSpecular)" opacity=".44" />
                        <rect className="gift-svg-lid-ribbon-shadow" x="171" y="122" width="3" height="34" rx="1.5" fill="#6F3900" opacity=".18" />
                        <rect className="gift-svg-lid-ribbon-shadow" x="268" y="122" width="3" height="34" rx="1.5" fill="#6F3900" opacity=".16" />
                        <path className="gift-svg-lid-ribbon-curve" d="M156 124 C160 132 160 142 158 151" fill="none" stroke="#FFF7D5" strokeOpacity=".28" strokeWidth="1.2" strokeLinecap="round" />
                        <path className="gift-svg-lid-ribbon-curve" d="M253 124 C257 132 257 142 255 151" fill="none" stroke="#FFF7D5" strokeOpacity=".24" strokeWidth="1.2" strokeLinecap="round" />

                        <path className="gift-svg-lid-shine" d="M128 125 H296" fill="none" stroke="#F3F9FF" strokeWidth="2" strokeLinecap="round" opacity=".32" />
                        <path className="gift-svg-lid-front-spec" d="M126 126 C153 121 180 122 200 125" fill="none" stroke="#FFFFFF" strokeOpacity=".22" strokeWidth="2.1" strokeLinecap="round" />
                        <path className="gift-svg-lid-bottom-depth" d="M124 153 H300" fill="none" stroke="#06194A" strokeOpacity=".18" strokeWidth="1.8" strokeLinecap="round" />

                        <g className="gift-svg-bow" filter="url(#giftTinyShadow)">
                          <path className="gift-svg-bow-under-left" d="M208 116 C183 101 150 101 143 112 C137 123 166 132 203 124 C176 121 166 114 175 106 C184 99 199 104 214 118 Z" fill="#8D5200" opacity=".16" transform="translate(0 3)" />
                          <path className="gift-svg-bow-under-right" d="M220 116 C245 101 278 101 285 112 C291 123 262 132 225 124 C252 121 262 114 253 106 C244 99 229 104 214 118 Z" fill="#8D5200" opacity=".15" transform="translate(0 3)" />
                          <path className="gift-svg-bow-left" d="M208 116 C183 101 150 101 143 112 C137 123 166 132 203 124 C176 121 166 114 175 106 C184 99 199 104 214 118 Z" fill="url(#giftBowMetal)" />
                          <path className="gift-svg-bow-right" d="M220 116 C245 101 278 101 285 112 C291 123 262 132 225 124 C252 121 262 114 253 106 C244 99 229 104 214 118 Z" fill="url(#giftBowMetal)" />
                          <path d="M209 116 C200 104 200 88 207 84 C216 79 218 95 215 111 C220 95 227 79 236 84 C245 89 238 106 220 117 Z" fill="url(#giftGold)" />
                          <rect x="204" y="108" width="21" height="20" rx="7" fill="url(#giftBowMetal)" />
                          <path d="M206 124 L198 149 L211 140 L216 158 L226 126 Z" fill="url(#giftGold)" />
                          <path d="M208 111 H214 V124 H208 Z" fill="#FFF8CF" opacity=".52" />
                          <path className="gift-svg-bow-highlight" d="M155 110 C168 104 188 107 199 115" fill="none" stroke="#FFF4B8" strokeOpacity=".55" strokeWidth="1.6" strokeLinecap="round" />
                          <path className="gift-svg-bow-highlight" d="M229 114 C241 106 261 104 274 110" fill="none" stroke="#FFF4B8" strokeOpacity=".48" strokeWidth="1.6" strokeLinecap="round" />
                          <ellipse className="gift-svg-knot-spec" cx="211" cy="112" rx="5.6" ry="3.2" fill="#FFF8CF" opacity=".58" />
                          <ellipse className="gift-svg-bow-core-shadow" cx="211" cy="121" rx="8" ry="3.4" fill="#7D4300" opacity=".14" />
                          <path className="gift-svg-bow-rim-light" d="M177 105 C187 101 198 106 205 113" fill="none" stroke="#FFF6C7" strokeOpacity=".42" strokeWidth="1.2" strokeLinecap="round" />
                          <path className="gift-svg-bow-rim-light" d="M220 113 C228 106 239 101 250 105" fill="none" stroke="#FFF6C7" strokeOpacity=".38" strokeWidth="1.2" strokeLinecap="round" />
                          <path className="gift-svg-tail-dark" d="M200 145 L211 137 L216 157" fill="none" stroke="#8A5000" strokeOpacity=".18" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </g>
                      </g>

                      <g className="gift-svg-closed-glints">
                        <path d="M238 181 l4 8 l8 4 l-8 4 l-4 8 l-4-8 l-8-4 l8-4Z" fill="#FFFFFF" opacity=".90" />
                      </g>
                    </g>

                    <ellipse className="gift-svg-contact-shadow" cx="212" cy="242" rx="88" ry="11" fill="#071838" opacity=".17" filter="url(#giftSoftShadow)" />
                    <ellipse className="gift-svg-contact-warm" cx="212" cy="238" rx="72" ry="7" fill="#F8B938" opacity=".18" filter="url(#giftGlowBlur)" />
                    {/* Front arc covers the lower face, completing the orbit in depth. */}
                    <g className="gift-svg-orbit-front" fill="none" strokeLinecap="round">
                      <path d="M76 184 C91 212 149 230 210 230 C276 230 331 211 345 184" stroke="#E6960D" strokeOpacity=".25" strokeWidth="12" filter="url(#giftGlowBlur)" />
                      <path d="M76 184 C91 212 149 230 210 230 C276 230 331 211 345 184" stroke="url(#giftOrbitFront)" strokeWidth="3.8" />
                      <path d="M113 209 C160 234 263 235 308 209" stroke="#FFF9D9" strokeOpacity=".78" strokeWidth="1.2" />
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
                className="gift-premium-cta w-full max-w-[290px] bg-gradient-to-b from-[#FF6A3D] to-[#EE4D2D] hover:from-[#ff774d] hover:to-[#f35a34] text-white font-extrabold py-4 rounded-[22px] transition-all disabled:opacity-70 text-[15px]"
              >
                <span className="gift-premium-cta-border" aria-hidden="true" />
                <span className="gift-premium-cta-sheen" aria-hidden="true" />
                <span className="gift-premium-cta-inner">
                  {phase === 'opening' ? (
                    <><Loader2 size={18} className="animate-spin" /> Đang mở quà...</>
                  ) : (
                    <><Gift size={18} /> {isLoggedIn ? 'Mở quà ngay' : 'Mở quà — Đăng nhập để nhận'}</>
                  )}
                </span>
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
