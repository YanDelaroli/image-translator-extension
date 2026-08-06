const OVERLAY_CLASS = 'image-translator-overlay';
let settings = { enabled: false, targetLanguage: 'pt' };
let observer;

function isUsableImage(image) {
  const rect = image.getBoundingClientRect();
  return image.complete && image.naturalWidth >= 120 && image.naturalHeight >= 60 && rect.width >= 80 && rect.height >= 40;
}

function removeOverlays() {
  document.querySelectorAll(`.${OVERLAY_CLASS}`).forEach((element) => element.remove());
  document.querySelectorAll('[data-image-translator-ready]').forEach((image) => {
    delete image.dataset.imageTranslatorReady;
  });
}

function createOverlay(image) {
  if (!settings.enabled || image.dataset.imageTranslatorReady || !isUsableImage(image)) return false;

  const rect = image.getBoundingClientRect();
  const overlay = document.createElement('div');
  overlay.className = OVERLAY_CLASS;
  overlay.textContent = `Imagem pronta para OCR → ${settings.targetLanguage.toUpperCase()}`;
  overlay.style.cssText = [
    'position: fixed',
    `left: ${Math.round(rect.left)}px`,
    `top: ${Math.round(rect.top)}px`,
    `width: ${Math.round(rect.width)}px`,
    'z-index: 2147483646',
    'pointer-events: none',
    'padding: 6px 8px',
    'background: rgba(17, 17, 17, .82)',
    'color: #fff',
    'font: 600 12px/1.3 system-ui, sans-serif',
    'border-radius: 6px 6px 0 0',
    'box-sizing: border-box'
  ].join(';');

  overlay.dataset.sourceImageId = crypto.randomUUID();
  image.dataset.imageTranslatorReady = overlay.dataset.sourceImageId;
  document.documentElement.appendChild(overlay);
  return true;
}

function scanPage() {
  if (!settings.enabled) return 0;
  let count = 0;
  document.querySelectorAll('img').forEach((image) => {
    if (createOverlay(image)) count += 1;
  });
  return count;
}

function refreshOverlayPositions() {
  document.querySelectorAll(`.${OVERLAY_CLASS}`).forEach((overlay) => {
    const image = document.querySelector(`[data-image-translator-ready="${CSS.escape(overlay.dataset.sourceImageId)}"]`);
    if (!image || !image.isConnected) {
      overlay.remove();
      return;
    }
    const rect = image.getBoundingClientRect();
    overlay.style.left = `${Math.round(rect.left)}px`;
    overlay.style.top = `${Math.round(rect.top)}px`;
    overlay.style.width = `${Math.round(rect.width)}px`;
    overlay.hidden = rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth;
  });
}

function startObserver() {
  observer?.disconnect();
  observer = new MutationObserver(() => scanPage());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

chrome.storage.sync.get({ enabled: false, targetLanguage: 'pt' }, (stored) => {
  settings = stored;
  if (settings.enabled) scanPage();
  startObserver();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SETTINGS_UPDATED') {
    settings = message.settings;
    removeOverlays();
    if (settings.enabled) scanPage();
    sendResponse({ ok: true });
  }

  if (message.type === 'SCAN_PAGE') {
    sendResponse({ count: scanPage() });
  }
});

addEventListener('scroll', refreshOverlayPositions, { passive: true });
addEventListener('resize', refreshOverlayPositions, { passive: true });
