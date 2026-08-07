const SCREEN_OVERLAY_ID = 'image-translator-screen-overlay';

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

function fitScreenText(label, maximum) {
  let size = Math.max(10, Math.min(30, maximum));
  label.style.fontSize = `${size}px`;
  while (size > 9 && (label.scrollWidth > label.clientWidth || label.scrollHeight > label.clientHeight)) {
    label.style.fontSize = `${--size}px`;
  }
}

async function processVisibleTab() {
  document.getElementById(SCREEN_OVERLAY_ID)?.remove();
  const capture = await chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' });
  if (!capture?.ok || !capture.dataUrl) throw new Error(capture?.error || 'Falha ao capturar a área visível.');

  const screenshot = await loadScreenshot(capture.dataUrl);
  const rawBlocks = await globalThis.ImageTranslatorOcr.recognize(screenshot);
  const lines = globalThis.ImageTranslatorLayout.groupIntoLines(rawBlocks);
  const paragraphs = globalThis.ImageTranslatorLayout.groupIntoParagraphs(lines);
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
    try {
      translated = await translateText(block.text, targetLanguage);
    } catch (error) {
      if (error.code === 'NATIVE_SETUP_REQUIRED') setupRequired = true;
    }

    const label = document.createElement('div');
    label.textContent = translated;
    label.title = block.text;
    label.style.cssText = [
      'position:absolute','display:flex','align-items:center','justify-content:center','padding:3px 6px',
      `left:${Math.max(0, block.box.x * scaleX)}px`,`top:${Math.max(0, block.box.y * scaleY)}px`,
      `width:${Math.max(32, block.box.width * scaleX)}px`,`height:${Math.max(20, block.box.height * scaleY)}px`,
      'background:rgba(255,255,255,.94)','color:#111','font-family:system-ui,sans-serif','font-weight:600',
      'line-height:1.08','text-align:center','border:1px solid rgba(0,0,0,.18)','border-radius:3px',
      'box-sizing:border-box','overflow:hidden','white-space:pre-line'
    ].join(';');
    overlay.appendChild(label);
    fitScreenText(label, block.box.height * scaleY * 0.45);
  }

  document.documentElement.appendChild(overlay);
  return { processed: 1, blocks: paragraphs.length, nativeSetupRequired: setupRequired };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SCAN_VISIBLE_TAB') {
    processVisibleTab().then(sendResponse).catch((error) => sendResponse({ processed: 0, error: error.message }));
    return true;
  }
  if (message.type === 'CLEAR_SCREEN_OVERLAY') {
    document.getElementById(SCREEN_OVERLAY_ID)?.remove();
    sendResponse({ ok: true });
  }
});
