chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(['enabled', 'targetLanguage']);
  await chrome.storage.sync.set({
    enabled: current.enabled ?? false,
    targetLanguage: current.targetLanguage ?? 'pt'
  });
});
