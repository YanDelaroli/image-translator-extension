const enabledInput = document.querySelector('#enabled');
const languageSelect = document.querySelector('#targetLanguage');
const scanButton = document.querySelector('#scan');
const statusOutput = document.querySelector('#status');

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendSettings() {
  const settings = {
    enabled: enabledInput.checked,
    targetLanguage: languageSelect.value
  };

  await chrome.storage.sync.set(settings);
  const tab = await getActiveTab();
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings }).catch(() => {});
  }
}

chrome.storage.sync.get({ enabled: false, targetLanguage: 'pt' }, (settings) => {
  enabledInput.checked = settings.enabled;
  languageSelect.value = settings.targetLanguage;
});

enabledInput.addEventListener('change', async () => {
  await sendSettings();
  statusOutput.textContent = enabledInput.checked ? 'Extensão ativada.' : 'Extensão desativada.';
});

languageSelect.addEventListener('change', async () => {
  await sendSettings();
  statusOutput.textContent = 'Idioma atualizado.';
});

scanButton.addEventListener('click', async () => {
  statusOutput.textContent = 'Analisando imagens...';
  const tab = await getActiveTab();
  if (!tab?.id) {
    statusOutput.textContent = 'Não foi possível acessar esta aba.';
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_PAGE' });
    statusOutput.textContent = `${response?.count ?? 0} imagem(ns) preparada(s).`;
  } catch {
    statusOutput.textContent = 'Recarregue a página e tente novamente.';
  }
});
