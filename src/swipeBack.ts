const EDGE_PX = 24;
const TRIGGER_PX = 80;
const MAX_VERTICAL_RATIO = 0.8;
const SCROLL_KEY = 'kimshop:return-scroll-y';

const isVisible = (el: Element) => {
  const node = el as HTMLElement;
  const rect = node.getBoundingClientRect();
  const style = window.getComputedStyle(node);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
};

const getText = (el: Element) => ((el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '')).trim();

const saveReturnScroll = () => {
  const y = Math.max(0, Math.round(window.scrollY || document.documentElement.scrollTop || 0));
  if (y > 0) sessionStorage.setItem(SCROLL_KEY, String(y));
};

const restoreReturnScroll = () => {
  const raw = sessionStorage.getItem(SCROLL_KEY);
  const y = raw ? Number(raw) : 0;
  if (!Number.isFinite(y) || y <= 0) return;

  // React may need a few frames to put the product list back in the DOM.
  const started = performance.now();
  const tryRestore = () => {
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    if (maxY >= Math.min(y, 80) || performance.now() - started > 900) {
      window.scrollTo({ top: Math.min(y, maxY || y), left: 0, behavior: 'auto' });
      return;
    }
    requestAnimationFrame(tryRestore);
  };
  requestAnimationFrame(() => requestAnimationFrame(tryRestore));
};

const isCloseControl = (el: Element) => {
  const text = getText(el).replace(/\s+/g, ' ').trim().toLowerCase();
  if (!['×', '✕', 'x', 'đóng', 'close'].includes(text)) return false;
  const rect = (el as HTMLElement).getBoundingClientRect();
  return rect.top < window.innerHeight * 0.35;
};

const isBackControl = (el: Element) => {
  const rect = (el as HTMLElement).getBoundingClientRect();
  if (rect.left > 180 || rect.top > 220) return false;
  const text = getText(el).replace(/\s+/g, ' ').trim().toLowerCase();
  return (
    text === '←' || text === '‹' || text === '⬅' ||
    text.includes('quay lại') || text.includes('trở lại') || text.includes('back')
  );
};

const hasVisibleDetailLayer = () => {
  return Array.from(document.querySelectorAll('button, [role="button"]')).some((el) => isVisible(el) && isCloseControl(el));
};

const clickFirst = (elements: Element[], restoreAfter = false) => {
  const target = elements.find(isVisible) as HTMLElement | undefined;
  if (!target) return false;
  target.click();
  if (restoreAfter) restoreReturnScroll();
  return true;
};

const findDialogClose = () => {
  const candidates = Array.from(document.querySelectorAll('button, [role="button"]')).filter((el) => isVisible(el) && isCloseControl(el));
  candidates.sort((a, b) => {
    const ra = (a as HTMLElement).getBoundingClientRect();
    const rb = (b as HTMLElement).getBoundingClientRect();
    return ra.top - rb.top || rb.left - ra.left;
  });
  return clickFirst(candidates, true);
};

const findBackButton = () => {
  const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]')).filter((el) => isVisible(el) && isBackControl(el));
  candidates.sort((a, b) => {
    const ra = (a as HTMLElement).getBoundingClientRect();
    const rb = (b as HTMLElement).getBoundingClientRect();
    return ra.top - rb.top || ra.left - rb.left;
  });
  return clickFirst(candidates, true);
};

const performBack = () => {
  // Close the top-most modal/detail overlay first.
  if (findDialogClose()) return;
  if (findBackButton()) return;

  // Only use browser history when it is clearly still inside KimShop.
  try {
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (ref && ref.origin === location.origin && history.length > 1) {
      history.back();
      restoreReturnScroll();
    }
  } catch {
    // At the app root: intentionally do nothing so a swipe cannot eject the user from KimShop.
  }
};

const installScrollMemory = () => {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  // Save the storefront position on the click that opens another view. Once a detail/modal
  // is visible we freeze the value so scrolling inside that view cannot overwrite it.
  document.addEventListener('pointerdown', (event) => {
    if (hasVisibleDetailLayer()) return;
    const target = event.target as HTMLElement | null;
    if (!target || target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (window.scrollY > 0) saveReturnScroll();
  }, { capture: true, passive: true });

  // Existing X/Back buttons should restore the same way as the swipe gesture.
  document.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest('button, a, [role="button"]');
    if (!target || !isVisible(target)) return;
    if (isCloseControl(target) || isBackControl(target)) restoreReturnScroll();
  }, { capture: true });
};

const installSwipeBack = () => {
  installScrollMemory();
  if (!('ontouchstart' in window) && !navigator.maxTouchPoints) return;

  let tracking = false;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;

  const indicator = document.createElement('div');
  indicator.setAttribute('aria-hidden', 'true');
  Object.assign(indicator.style, {
    position: 'fixed', left: '10px', top: '50%', width: '42px', height: '42px',
    borderRadius: '999px', background: 'rgba(0,0,0,.58)', color: '#fff',
    display: 'grid', placeItems: 'center', fontSize: '24px', zIndex: '2147483647',
    opacity: '0', transform: 'translate(-16px,-50%) scale(.9)',
    transition: 'opacity .12s ease, transform .12s ease', pointerEvents: 'none',
    boxShadow: '0 4px 18px rgba(0,0,0,.18)'
  } as Partial<CSSStyleDeclaration>);
  indicator.textContent = '←';
  document.body.appendChild(indicator);

  const reset = () => {
    tracking = false;
    indicator.style.opacity = '0';
    indicator.style.transform = 'translate(-16px,-50%) scale(.9)';
  };

  document.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (touch.clientX > EDGE_PX) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    tracking = true;
    startX = currentX = touch.clientX;
    startY = currentY = touch.clientY;
  }, { passive: true });

  document.addEventListener('touchmove', (event) => {
    if (!tracking || event.touches.length !== 1) return;
    const touch = event.touches[0];
    currentX = touch.clientX;
    currentY = touch.clientY;
    const dx = Math.max(0, currentX - startX);
    const dy = Math.abs(currentY - startY);
    if (dy > dx * MAX_VERTICAL_RATIO + 12) return reset();
    if (dx > 16) {
      const progress = Math.min(1, dx / TRIGGER_PX);
      indicator.style.opacity = String(0.2 + progress * 0.8);
      indicator.style.transform = `translate(${Math.min(18, dx * 0.15)}px,-50%) scale(${0.9 + progress * 0.1})`;
    }
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!tracking) return;
    const dx = currentX - startX;
    const dy = Math.abs(currentY - startY);
    const shouldBack = dx >= TRIGGER_PX && dy <= dx * MAX_VERTICAL_RATIO;
    reset();
    if (shouldBack) performBack();
  }, { passive: true });

  document.addEventListener('touchcancel', reset, { passive: true });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installSwipeBack, { once: true });
} else {
  installSwipeBack();
}
