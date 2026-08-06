const OVERLAY_CLASS = 'image-translator-overlay';
const LABEL_CLASS = 'image-translator-label';
let settings = { enabled: false, targetLanguage: 'pt' };
let observer;
let processing = false;

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

function findImageForOverlay(overlay) {
  const id = overlay.dataset.sourceImageId;
  return document.querySelector(`[data-image-translator-ready="${CSS.escape(id)}"]`);
}

function syncOverlay(overlay, image) {
  const rect = image.getBoundingClientRect();
  overlay.style.left = `${Math.round(rect.left)}px`;
  overlay.style.top = `${Math.round(rect.top)}px`;
  overlay.style.width = `${Math.round(rect.width)}px`;
  overlay.style.height = `${Math.round(rect.height)}px`;
  overlay.hidden = rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth;
}

function createOverlay(image) {
  if (!settings.enabled || image.dataset.imageTranslatorReady || !isUsableImage(image)) return false;

  const overlay = document.createElement('div');
  overlay.className = OVERLAY_CLASS;
  overlay.dataset.sourceImageId = crypto.randomUUID();
  overlay.style.cssText = [
    'position: fixed',
    'z-index: 2147483646',
    'pointer-events: none',
    'overflow: hidden',
    'box-sizing: border-box'
  ].join(';');

  const status = document.createElement('div');
  status.className = LABEL_CLASS;
  status.textContent = `Pronta para OCR → ${settings.targetLanguage.toUpperCase()}`;
  status.style.cssText = [
    'position: absolute',
    'left: 0',
    'top: 0',
    'max-width: 100%',
    'padding: 5px 7px',
    'background: rgba(17,17,17,.82)',
    'color: #fff',
    'font: 600 12px/1.3 system-ui,sans-serif',
    'border-radius: 0 0 6px 0',
    'box-sizing: border-box'
  ].join(';');
  overlay.appendChild(status);

  image.dataset.imageTranslatorReady = overlay.dataset.sourceImageId;
  document.documentElement.appendChild(overlay);
  syncOverlay(overlay, image);
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
    const image = findImageForOverlay(overlay);
    if (!image || !image.isConnected) {
      overlay.remove();
      return;
    }
    syncOverlay(overlay, image);
  });
}

function renderOcrResult(overlay, image, blocks) {
  overlay.replaceChildren();
  const scaleX = image.getBoundingClientRect().width / image.naturalWidth;
  const scaleY = image.getBoundingClientRect().height / image.naturalHeight;

  blocks.forEach(({ text, box }) => {
    const label = document.createElement('div');
    label.textContent = text;
    label.title = 'Texto reconhecido; tradução será conectada na próxima etapa.';
    label.style.cssText = [
      'position: absolute',
      `left: ${Math.max(0, box.x * scaleX)}px`,
      `top: ${Math.max(0, box.y * scaleY)}px`,
      `width: ${Math.max(24, box.width * scaleX)}px`,
      `min-height: ${Math.max(18, box.height * scaleY)}px`,
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'padding: 2px 4px',
      'background: rgba(255,255,255,.92)',
      'color: #111',
      'font: 600 12px/1.2 system-ui,sans-serif',
      'text-align: center',
      'border: 1px solid rgba(0,0,0,.18)',
      'border-radius: 3px',
      'box-sizing: border-box',
      'overflow: hidden'
    ].join(';');
    overlay.appendChild(label);
  });
}

async function runOcr() {
  if (processing || !settings.enabled) return { processed: 0, unsupported: false };
  processing = true;
  let processed = 0;

  try {
    if (!globalThis.ImageTranslatorOcr?.isSupported()) {
      document.querySelectorAll(`.${LABEL_CLASS}`).forEach((label) => {
        label.textContent = 'OCR nativo indisponível neste Chrome';
      });
      return { processed: 0, unsupported: true };
    }

    for (const overlay of document.querySelectorAll(`.${OVERLAY_CLASS}`)) {
      const image = findImageForOverlay(overlay);
      if (!image || !isUsableImage(image)) continue;

      const status = overlay.querySelector(`.${LABEL_CLASS}`);
      if (status) status.textContent = 'Reconhecendo texto…';

      try {
        const blocks = await globalThis.ImageTranslatorOcr.recognize(image);
        renderOcrResult(overlay, image, blocks);
        processed += 1;
      } catch (error) {
        if (status) status.textContent = `Falha no OCR: ${error.message}`;
      }
    }

    return { processed, unsupported: false };
  } finally {
    processing = false;
  }
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
    return;
  }

  if (message.type === 'SCAN_PAGE') {
    scanPage();
    runOcr().then(sendResponse);
    return true;
  }
});

addEventListener('scroll', refreshOverlayPositions, { passive: true });
addEventListener('resize', refreshOverlayPositions, { passive: true });
