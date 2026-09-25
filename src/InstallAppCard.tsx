import { useEffect, useState } from 'react';
import { CheckCircle2, Download, ExternalLink, Share2, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { getInstallPrompt, installApp, onInstallPromptChange } from './installPrompt';

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export default function InstallAppCard() {
  const [available, setAvailable] = useState(Boolean(getInstallPrompt()));
  const [installed, setInstalled] = useState(isInstalled);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(navigator.userAgent);
  const mobile = ios || android;

  useEffect(() => {
    const refresh = () => {
      setAvailable(Boolean(getInstallPrompt()));
      setInstalled(isInstalled());
    };
    const unsubscribe = onInstallPromptChange(refresh);
    const media = window.matchMedia('(display-mode: standalone)');
    media.addEventListener?.('change', refresh);
    return () => { unsubscribe(); media.removeEventListener?.('change', refresh); };
  }, []);

  useEffect(() => {
    if (mobile) return;
    let alive = true;
    QRCode.toDataURL(window.location.origin + '/', { width: 176, margin: 1, color: { dark: '#263044', light: '#ffffff' } })
      .then((url) => { if (alive) setQr(url); })
      .catch(() => {});
    return () => { alive = false; };
  }, [mobile]);

  async function handleInstall() {
    setError('');
    try { await installApp(); }
    catch { setError('Không mở được cửa sổ cài đặt. Hãy dùng menu của trình duyệt để thêm Shopee Mini vào màn hình chính.'); }
  }

  return <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4" aria-labelledby="kimshop-install-title">
    <div className="flex items-start gap-3">
      <div className="bg-orange-50 text-[#EE4D2D] rounded-xl p-2.5"><Smartphone size={22} /></div>
      <div>
        <h3 id="kimshop-install-title" className="font-bold text-sm text-gray-800">TẢI ỨNG DỤNG SHOPEE MINI</h3>
        <p className="text-gray-500 text-xs mt-1">Thêm Shopee Mini vào màn hình chính để mở nhanh như một ứng dụng.</p>
      </div>
    </div>

    {installed ? <div className="flex items-center gap-2 rounded-xl bg-green-50 text-green-700 px-4 py-3 text-sm font-medium"><CheckCircle2 size={18} /> Shopee Mini đã ở trên màn hình chính của bạn.</div> : <>
      {available && <button type="button" onClick={handleInstall} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#EE4D2D] px-5 py-3 text-white text-sm font-bold hover:bg-[#d83f24] active:scale-[.99] transition w-full sm:w-auto"><Download size={17} /> Cài ứng dụng Shopee Mini</button>}
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

      {ios && <div className="bg-orange-50/70 border border-orange-100 rounded-xl p-4 text-gray-700 text-sm space-y-2">
        <p className="font-semibold">Cài trên iPhone / iPad</p>
        <p>1. Mở trang này bằng <strong>Safari</strong>.</p>
        <p className="flex items-center gap-1.5">2. Nhấn <Share2 size={15} aria-hidden="true" /> <strong>Chia sẻ</strong>, chọn <strong>Thêm vào Màn hình chính</strong>.</p>
        <p>3. Bật <strong>Mở dưới dạng ứng dụng</strong> nếu có, rồi nhấn <strong>Thêm</strong>.</p>
      </div>}

      {android && !available && <div className="bg-orange-50/70 border border-orange-100 rounded-xl p-4 text-gray-700 text-sm space-y-2">
        <p className="font-semibold">Cài trên Android</p>
        <p>Mở Shopee Mini bằng Chrome, nhấn menu <strong>⋮</strong> rồi chọn <strong>Cài đặt ứng dụng</strong> hoặc <strong>Thêm vào màn hình chính</strong>.</p>
      </div>}

      {!mobile && <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl bg-orange-50/70 border border-orange-100 p-4">
        {qr && <img src={qr} alt="Mã QR mở Shopee Mini trên điện thoại" width="116" height="116" className="rounded-lg border border-white bg-white p-1 shrink-0" />}
        <div className="text-sm text-gray-700 space-y-1.5">
          <p className="font-semibold">Cài trên điện thoại</p>
          <p>Quét mã QR bằng điện thoại để mở Shopee Mini, rồi thêm vào màn hình chính.</p>
          <a href={window.location.origin + '/'} className="text-[#EE4D2D] break-all inline-flex items-center gap-1" target="_blank" rel="noopener noreferrer">{window.location.host}<ExternalLink size={13} /></a>
        </div>
      </div>}
    </>}
  </section>;
}
