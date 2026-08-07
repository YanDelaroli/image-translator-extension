const DEFAULTS = {
  enabled: false,
  targetLanguage: 'pt',
  translationEndpoint: '',
  translationApiKey: ''
};
const translationCache = new Map();
const inFlightTranslations = new Map();
const debuggerSessions = new Map();
const MAX_CACHE_ENTRIES = 500;
const OCR_CACHE_PREFIX = 'ocr-cache:';

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(Object.keys(DEFAULTS));
  await chrome.storage.sync.set({
    enabled: current.enabled ?? DEFAULTS.enabled,
    targetLanguage: current.targetLanguage ?? DEFAULTS.targetLanguage,
    translationEndpoint: current.translationEndpoint ?? DEFAULTS.translationEndpoint,
    translationApiKey: current.translationApiKey ?? DEFAULTS.translationApiKey
  });
});

function rememberTranslation(key, value) {
  if (translationCache.size >= MAX_CACHE_ENTRIES) translationCache.delete(translationCache.keys().next().value);
  translationCache.set(key, value);
}

async function requestTranslation(text, targetLanguage) {
  const { translationEndpoint, translationApiKey } = await chrome.storage.sync.get({ translationEndpoint: '', translationApiKey: '' });
  if (!translationEndpoint) return { translatedText: text, skipped: true, reason: 'missing_endpoint' };
  const body = { q: text, source: 'auto', target: targetLanguage, format: 'text' };
  if (translationApiKey) body.api_key = translationApiKey;
  const response = await fetch(translationEndpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`API de tradução respondeu ${response.status}`);
  const data = await response.json();
  const translatedText = data.translatedText ?? data.translation ?? data.data?.translations?.[0]?.translatedText;
  if (!translatedText) throw new Error('Resposta da API sem texto traduzido');
  return { translatedText, skipped: false };
}

async function translateText(text, targetLanguage) {
  const normalizedText = text.trim();
  const cacheKey = `${targetLanguage}:${normalizedText}`;
  if (translationCache.has(cacheKey)) return { ...translationCache.get(cacheKey), cached: true };
  if (inFlightTranslations.has(cacheKey)) return inFlightTranslations.get(cacheKey);
  const pending = requestTranslation(normalizedText, targetLanguage)
    .then((result) => { rememberTranslation(cacheKey, result); return result; })
    .finally(() => inFlightTranslations.delete(cacheKey));
  inFlightTranslations.set(cacheKey, pending);
  return pending;
}

async function clearCaches() {
  const stored = await chrome.storage.local.get(null);
  const ocrKeys = Object.keys(stored).filter((key) => key.startsWith(OCR_CACHE_PREFIX));
  if (ocrKeys.length) await chrome.storage.local.remove(ocrKeys);
  const removed = ocrKeys.length + translationCache.size;
  translationCache.clear();
  inFlightTranslations.clear();
  return removed;
}

async function startDebuggerCapture(tabId) {
  const existing = debuggerSessions.get(tabId);
  if (existing) return existing;
  const target = { tabId };
  await chrome.debugger.attach(target, '1.3');
  try {
    await chrome.debugger.sendCommand(target, 'Page.enable');
    const metrics = await chrome.debugger.sendCommand(target, 'Page.getLayoutMetrics');
    const size = metrics.cssContentSize || metrics.contentSize;
    if (!size?.width || !size?.height) throw new Error('Não foi possível medir a página.');
    const session = { target, width: Math.ceil(size.width), height: Math.ceil(size.height) };
    debuggerSessions.set(tabId, session);
    return session;
  } catch (error) {
    await chrome.debugger.detach(target).catch(() => {});
    throw error;
  }
}

async function captureDebuggerTile(tabId, y, height) {
  const session = debuggerSessions.get(tabId);
  if (!session) throw new Error('A sessão de captura não está ativa.');
  const clippedY = Math.max(0, Math.min(Number(y) || 0, session.height));
  const clippedHeight = Math.max(1, Math.min(Number(height) || 1200, session.height - clippedY));
  const result = await chrome.debugger.sendCommand(session.target, 'Page.captureScreenshot', {
    format: 'jpeg',
    quality: 86,
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x: 0, y: clippedY, width: session.width, height: clippedHeight, scale: 1 }
  });
  return {
    dataUrl: `data:image/jpeg;base64,${result.data}`,
    y: clippedY,
    width: session.width,
    height: clippedHeight,
    documentHeight: session.height
  };
}

async function endDebuggerCapture(tabId) {
  const session = debuggerSessions.get(tabId);
  debuggerSessions.delete(tabId);
  if (session) await chrome.debugger.detach(session.target).catch(() => {});
}

chrome.tabs.onRemoved.addListener((tabId) => { endDebuggerCapture(tabId); });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRANSLATE_TEXT') {
    translateText(message.text, message.targetLanguage)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === 'CLEAR_CACHES') {
    clearCaches().then((removed) => sendResponse({ ok: true, removed })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === 'CAPTURE_VISIBLE_TAB') {
    chrome.tabs.captureVisibleTab(sender.tab?.windowId, { format: 'png' })
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === 'START_FULL_PAGE_CAPTURE') {
    if (!sender.tab?.id) return void sendResponse({ ok: false, error: 'A aba ativa não foi identificada.' });
    startDebuggerCapture(sender.tab.id)
      .then(({ width, height }) => sendResponse({ ok: true, width, height }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === 'CAPTURE_FULL_PAGE_TILE') {
    if (!sender.tab?.id) return void sendResponse({ ok: false, error: 'A aba ativa não foi identificada.' });
    captureDebuggerTile(sender.tab.id, message.y, message.height)
      .then((tile) => sendResponse({ ok: true, ...tile }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === 'END_FULL_PAGE_CAPTURE') {
    if (!sender.tab?.id) return void sendResponse({ ok: true });
    endDebuggerCapture(sender.tab.id).then(() => sendResponse({ ok: true }));
    return true;
  }
});
