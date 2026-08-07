const SCREEN_OVERLAY_ID = 'image-translator-screen-overlay';
const PAGE_OVERLAY_ID = 'image-translator-page-overlay';
const OCR_TILE_CSS_HEIGHT = 1200;
const OCR_TILE_OVERLAP = 120;
const MAX_FULL_PAGE_TILES = 100;

async function loadScreenshot(dataUrl) {
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('Não foi possível carregar a captura da aba.'));
    image.src = dataUrl;
  });
  return image;
}

async function translateText(text, targetLanguage) {
  try {
    const nativeResult = await globalThis.ImageTranslatorNative?.translate(text, targetLanguage);
    if (nativeResult?.supported) return nativeResult.translatedText;
  } catch (error) {
    if (error.code === 'NATIVE_SETUP_REQUIRED') throw error;
  }
  const fallback = await chrome.runtime.sendMessage({ type: 'TRANSLATE_TEXT', text, targetLanguage });
  return fallback?.ok && !fallback.skipped ? fallback.translatedText : text;
}

function fitText(label, maximum) {
  let size = Math.max(10, Math.min(30, maximum));
  label.style.fontSize = `${size}px`;
  while (size > 9 && (label.scrollWidth > label.clientWidth || label.scrollHeight > label.clientHeight)) {
    label.style.fontSize = `${--size}px`;
  }
}

function createLabel(block, translated, scaleX, scaleY, offsetX = 0, offsetY = 0) {
  const label = document.createElement('div');
  label.textContent = translated;
  label.title = block.text;
  label.style.cssText = [
    'position:absolute','display:flex','align-items:center','justify-content:center','padding:3px 6px',
    `left:${Math.max(0, offsetX + block.box.x * scaleX)}px`,`top:${Math.max(0, offsetY + block.box.y * scaleY)}px`,
    `width:${Math.max(32, block.box.width * scaleX)}px`,`height:${Math.max(20, block.box.height * scaleY)}px`,
    'background:rgba(255,255,255,.94)','color:#111','font-family:system-ui,sans-serif','font-weight:600',
    'line-height:1.08','text-align:center','border:1px solid rgba(0,0,0,.18)','border-radius:3px',
    'box-sizing:border-box','overflow:hidden','white-space:pre-line','pointer-events:none'
  ].join(';');
  return label;
}

async function recognizeScreenshot(screenshot) {
  const rawBlocks = await globalThis.ImageTranslatorOcr.recognize(screenshot);
  const lines = globalThis.ImageTranslatorLayout.groupIntoLines(rawBlocks);
  return globalThis.ImageTranslatorLayout.groupIntoParagraphs(lines);
}

async function processVisibleTab() {
  document.getElementById(SCREEN_OVERLAY_ID)?.remove();
  const capture = await chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' });
  if (!capture?.ok || !capture.dataUrl) throw new Error(capture?.error || 'Falha ao capturar a área visível.');
  const screenshot = await loadScreenshot(capture.dataUrl);
  const paragraphs = await recognizeScreenshot(screenshot);
  if (!paragraphs.length) return { processed: 0, reason: 'no_text' };
  const { targetLanguage = 'pt' } = await chrome.storage.sync.get({ targetLanguage: 'pt' });
  const overlay = document.createElement('div');
  overlay.id = SCREEN_OVERLAY_ID;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;overflow:hidden';
  const scaleX = innerWidth / screenshot.naturalWidth;
  const scaleY = innerHeight / screenshot.naturalHeight;
  let setupRequired = false;
  for (const block of paragraphs) {
    let translated = block.text;
    try { translated = await translateText(block.text, targetLanguage); }
    catch (error) { if (error.code === 'NATIVE_SETUP_REQUIRED') setupRequired = true; }
    const label = createLabel(block, translated, scaleX, scaleY);
    overlay.appendChild(label);
    fitText(label, block.box.height * scaleY * 0.45);
  }
  document.documentElement.appendChild(overlay);
  return { processed: 1, blocks: paragraphs.length, nativeSetupRequired: setupRequired };
}

function blockKey(text, x, y, width, height) {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return `${normalized}|${Math.round(x / 24)}|${Math.round(y / 24)}|${Math.round(width / 24)}|${Math.round(height / 24)}`;
}

function cropTile(image, sourceY, sourceHeight) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = sourceHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, sourceY, image.naturalWidth, sourceHeight, 0, 0, image.naturalWidth, sourceHeight);
  return canvas;
}

async function processFullPageWithoutScroll() {
  document.getElementById(SCREEN_OVERLAY_ID)?.remove();
  document.getElementById(PAGE_OVERLAY_ID)?.remove();
  const capture = await chrome.runtime.sendMessage({ type: 'CAPTURE_FULL_PAGE' });
  if (!capture?.ok || !capture.dataUrl) throw new Error(capture?.error || 'Falha ao capturar a página inteira.');

  const screenshot = await loadScreenshot(capture.dataUrl);
  const documentWidth = capture.width || document.documentElement.scrollWidth;
  const documentHeight = capture.height || document.documentElement.scrollHeight;
  const pixelPerCssX = screenshot.naturalWidth / documentWidth;
  const pixelPerCssY = screenshot.naturalHeight / documentHeight;
  const cssPerPixelX = documentWidth / screenshot.naturalWidth;
  const cssPerPixelY = documentHeight / screenshot.naturalHeight;
  const tilePixelHeight = Math.max(200, Math.round(OCR_TILE_CSS_HEIGHT * pixelPerCssY));
  const overlapPixels = Math.max(20, Math.round(OCR_TILE_OVERLAP * pixelPerCssY));
  const stepPixels = Math.max(1, tilePixelHeight - overlapPixels);

  const overlay = document.createElement('div');
  overlay.id = PAGE_OVERLAY_ID;
  overlay.style.cssText = `position:absolute;left:0;top:0;width:${documentWidth}px;height:${documentHeight}px;z-index:2147483646;pointer-events:none;overflow:visible`;
  document.documentElement.appendChild(overlay);

  const { targetLanguage = 'pt' } = await chrome.storage.sync.get({ targetLanguage: 'pt' });
  const seen = new Set();
  let totalBlocks = 0;
  let tiles = 0;
  let setupRequired = false;

  for (let sourceY = 0; sourceY < screenshot.naturalHeight && tiles < MAX_FULL_PAGE_TILES; sourceY += stepPixels) {
    const sourceHeight = Math.min(tilePixelHeight, screenshot.naturalHeight - sourceY);
    const tile = cropTile(screenshot, sourceY, sourceHeight);
    const paragraphs = await recognizeScreenshot(tile);

    for (const block of paragraphs) {
      const docX = block.box.x * cssPerPixelX;
      const docY = (sourceY + block.box.y) * cssPerPixelY;
      const docWidth = block.box.width * cssPerPixelX;
      const docHeight = block.box.height * cssPerPixelY;
      const key = blockKey(block.text, docX, docY, docWidth, docHeight);
      if (seen.has(key)) continue;
      seen.add(key);

      let translated = block.text;
      try { translated = await translateText(block.text, targetLanguage); }
      catch (error) { if (error.code === 'NATIVE_SETUP_REQUIRED') setupRequired = true; }

      const label = createLabel(block, translated, cssPerPixelX, cssPerPixelY, 0, sourceY * cssPerPixelY);
      overlay.appendChild(label);
      fitText(label, block.box.height * cssPerPixelY * 0.45);
      totalBlocks += 1;
    }
    tiles += 1;
  }

  return {
    processed: tiles,
    blocks: totalBlocks,
    nativeSetupRequired: setupRequired,
    truncated: tiles >= MAX_FULL_PAGE_TILES && tilePixelHeight * tiles < screenshot.naturalHeight,
    captureMode: 'debugger-full-page'
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SCAN_VISIBLE_TAB') {
    processVisibleTab().then(sendResponse).catch((error) => sendResponse({ processed: 0, error: error.message }));
    return true;
  }
  if (message.type === 'SCAN_FULL_PAGE') {
    processFullPageWithoutScroll().then(sendResponse).catch((error) => sendResponse({ processed: 0, error: error.message }));
    return true;
  }
  if (message.type === 'CLEAR_SCREEN_OVERLAY') {
    document.getElementById(SCREEN_OVERLAY_ID)?.remove();
    document.getElementById(PAGE_OVERLAY_ID)?.remove();
    sendResponse({ ok: true });
  }
});
