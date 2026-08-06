const OVERLAY_CLASS = 'image-translator-overlay';
const LABEL_CLASS = 'image-translator-label';
let settings = { enabled: false, targetLanguage: 'pt', translationEndpoint: '', translationApiKey: '' };
let observer;
let processing = false;

function isUsableImage(image) {
  const rect = image.getBoundingClientRect();
  return image.complete && image.naturalWidth >= 120 && image.naturalHeight >= 60 && rect.width >= 80 && rect.height >= 40;
}

function removeOverlays() {
  document.querySelectorAll(`.${OVERLAY_CLASS}`).forEach((element) => element.remove());
  document.querySelectorAll('[data-image-translator-ready]').forEach((image) => delete image.dataset.imageTranslatorReady);
}

function findImageForOverlay(overlay) {
  return document.querySelector(`[data-image-translator-ready="${CSS.escape(overlay.dataset.sourceImageId)}"]`);
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
  overlay.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;overflow:hidden;box-sizing:border-box';

  const status = document.createElement('div');
  status.className = LABEL_CLASS;
  status.textContent = `Pronta para OCR → ${settings.targetLanguage.toUpperCase()}`;
  status.style.cssText = 'position:absolute;left:0;top:0;max-width:100%;padding:5px 7px;background:rgba(17,17,17,.82);color:#fff;font:600 12px/1.3 system-ui,sans-serif;border-radius:0 0 6px 0;box-sizing:border-box';
  overlay.appendChild(status);

  image.dataset.imageTranslatorReady = overlay.dataset.sourceImageId;
  document.documentElement.appendChild(overlay);
  syncOverlay(overlay, image);
  return true;
}

function scanPage() {
  if (!settings.enabled) return 0;
  let count = 0;
  document.querySelectorAll('img').forEach((image) => { if (createOverlay(image)) count += 1; });
  return count;
}

function refreshOverlayPositions() {
  document.querySelectorAll(`.${OVERLAY_CLASS}`).forEach((overlay) => {
    const image = findImageForOverlay(overlay);
    if (!image?.isConnected) return overlay.remove();
    syncOverlay(overlay, image);
  });
}

async function translateBlock(text) {
  const response = await chrome.runtime.sendMessage({ type: 'TRANSLATE_TEXT', text, targetLanguage: settings.targetLanguage });
  if (!response?.ok) throw new Error(response?.error || 'Falha desconhecida na tradução');
  return response;
}

async function translateBlocks(blocks) {
  let skipped = false;
  const translated = [];

  for (const block of blocks) {
    try {
      const result = await translateBlock(block.text);
      skipped ||= Boolean(result.skipped);
      translated.push({ ...block, originalText: block.text, text: result.translatedText });
    } catch (error) {
      translated.push({ ...block, originalText: block.text, translationError: error.message });
    }
  }

  return { blocks: translated, skipped };
}

function fitText(label, maxSize) {
  let size = Math.max(10, Math.min(30, maxSize));
  label.style.fontSize = `${size}px`;
  while (size > 9 && (label.scrollWidth > label.clientWidth || label.scrollHeight > label.clientHeight)) {
    size -= 1;
    label.style.fontSize = `${size}px`;
  }
}

function renderOcrResult(overlay, image, blocks) {
  overlay.replaceChildren();
  const rect = image.getBoundingClientRect();
  const scaleX = rect.width / image.naturalWidth;
  const scaleY = rect.height / image.naturalHeight;

  blocks.forEach(({ text, originalText, translationError, box }) => {
    const label = document.createElement('div');
    label.textContent = text;
    label.title = translationError ? `${originalText || text}\nErro: ${translationError}` : (originalText && originalText !== text ? originalText : 'Texto reconhecido');
    label.style.cssText = [
      'position:absolute',
      `left:${Math.max(0, box.x * scaleX)}px`,
      `top:${Math.max(0, box.y * scaleY)}px`,
      `width:${Math.max(32, box.width * scaleX)}px`,
      `height:${Math.max(20, box.height * scaleY)}px`,
      'display:flex','align-items:center','justify-content:center','padding:2px 5px',
      `background:${translationError ? 'rgba(255,235,235,.95)' : 'rgba(255,255,255,.95)'}`,
      'color:#111','font-family:system-ui,sans-serif','font-weight:600','line-height:1.05','text-align:center',
      'border:1px solid rgba(0,0,0,.18)','border-radius:3px','box-sizing:border-box','overflow:hidden','white-space:normal'
    ].join(';');
    overlay.appendChild(label);
    fitText(label, box.height * scaleY * 0.78);
  });
}

async function processOverlay(overlay) {
  const image = findImageForOverlay(overlay);
  if (!image || !isUsableImage(image)) return { processed: false, skipped: false };
  const status = overlay.querySelector(`.${LABEL_CLASS}`);
  if (status) status.textContent = 'Reconhecendo texto…';

  const recognizedBlocks = await globalThis.ImageTranslatorOcr.recognize(image);
  const groupedLines = globalThis.ImageTranslatorLayout.groupIntoLines(recognizedBlocks);
  if (status) status.textContent = `Traduzindo ${groupedLines.length} linha(s)…`;
  const result = await translateBlocks(groupedLines);
  renderOcrResult(overlay, image, result.blocks);
  return { processed: true, skipped: result.skipped };
}

async function runOcr() {
  if (processing || !settings.enabled) return { processed: 0, unsupported: false, translationSkipped: false };
  processing = true;
  let processed = 0;
  let translationSkipped = false;

  try {
    if (!globalThis.ImageTranslatorOcr?.isSupported()) {
      document.querySelectorAll(`.${LABEL_CLASS}`).forEach((label) => { label.textContent = 'Nenhum motor OCR disponível'; });
      return { processed: 0, unsupported: true, translationSkipped: false };
    }

    for (const overlay of document.querySelectorAll(`.${OVERLAY_CLASS}`)) {
      try {
        const result = await processOverlay(overlay);
        if (result.processed) processed += 1;
        translationSkipped ||= result.skipped;
      } catch (error) {
        const status = overlay.querySelector(`.${LABEL_CLASS}`);
        if (status) status.textContent = `Falha no processamento: ${error.message}`;
      }
    }

    return { processed, unsupported: false, translationSkipped };
  } finally {
    processing = false;
  }
}

function startObserver() {
  observer?.disconnect();
  observer = new MutationObserver(() => scanPage());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

chrome.storage.sync.get({ enabled: false, targetLanguage: 'pt', translationEndpoint: '', translationApiKey: '' }, (stored) => {
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
