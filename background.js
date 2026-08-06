const DEFAULTS = {
  enabled: false,
  targetLanguage: 'pt',
  translationEndpoint: '',
  translationApiKey: ''
};
const translationCache = new Map();
const inFlightTranslations = new Map();
const MAX_CACHE_ENTRIES = 500;

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
  if (translationCache.size >= MAX_CACHE_ENTRIES) {
    translationCache.delete(translationCache.keys().next().value);
  }
  translationCache.set(key, value);
}

async function requestTranslation(text, targetLanguage) {
  const { translationEndpoint, translationApiKey } = await chrome.storage.sync.get({
    translationEndpoint: '',
    translationApiKey: ''
  });

  if (!translationEndpoint) {
    return { translatedText: text, skipped: true, reason: 'missing_endpoint' };
  }

  const body = {
    q: text,
    source: 'auto',
    target: targetLanguage,
    format: 'text'
  };

  if (translationApiKey) body.api_key = translationApiKey;

  const response = await fetch(translationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`API de tradução respondeu ${response.status}`);
  }

  const data = await response.json();
  const translatedText = data.translatedText ?? data.translation ?? data.data?.translations?.[0]?.translatedText;

  if (!translatedText) {
    throw new Error('Resposta da API sem texto traduzido');
  }

  return { translatedText, skipped: false };
}

async function translateText(text, targetLanguage) {
  const normalizedText = text.trim();
  const cacheKey = `${targetLanguage}:${normalizedText}`;

  if (translationCache.has(cacheKey)) {
    return { ...translationCache.get(cacheKey), cached: true };
  }

  if (inFlightTranslations.has(cacheKey)) {
    return inFlightTranslations.get(cacheKey);
  }

  const pending = requestTranslation(normalizedText, targetLanguage)
    .then((result) => {
      rememberTranslation(cacheKey, result);
      return result;
    })
    .finally(() => inFlightTranslations.delete(cacheKey));

  inFlightTranslations.set(cacheKey, pending);
  return pending;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'TRANSLATE_TEXT') return;

  translateText(message.text, message.targetLanguage)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
