const enabledInput = document.querySelector('#enabled');
const languageSelect = document.querySelector('#targetLanguage');
const endpointInput = document.querySelector('#translationEndpoint');
const apiKeyInput = document.querySelector('#translationApiKey');
const scanButton = document.querySelector('#scan');
const statusOutput = document.querySelector('#status');

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function currentSettings() {
  return {
    enabled: enabledInput.checked,
    targetLanguage: languageSelect.value,
    translationEndpoint: endpointInput.value.trim(),
    translationApiKey: apiKeyInput.value.trim()
  };
}

async function sendSettings() {
  const settings = currentSettings();
  await chrome.storage.sync.set(settings);
  const tab = await getActiveTab();
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings }).catch(() => {});
  }
}

chrome.storage.sync.get({
  enabled: false,
  targetLanguage: 'pt',
  translationEndpoint: '',
  translationApiKey: ''
}, (settings) => {
  enabledInput.checked = settings.enabled;
  languageSelect.value = settings.targetLanguage;
  endpointInput.value = settings.translationEndpoint;
  apiKeyInput.value = settings.translationApiKey;
});

enabledInput.addEventListener('change', async () => {
  await sendSettings();
  statusOutput.textContent = enabledInput.checked ? 'Extensão ativada.' : 'Extensão desativada.';
});

languageSelect.addEventListener('change', async () => {
  await sendSettings();
  statusOutput.textContent = 'Idioma atualizado.';
});

endpointInput.addEventListener('change', async () => {
  await sendSettings();
  statusOutput.textContent = 'Endpoint salvo.';
});

apiKeyInput.addEventListener('change', async () => {
  await sendSettings();
  statusOutput.textContent = 'Chave salva.';
});

scanButton.addEventListener('click', async () => {
  await sendSettings();
  statusOutput.textContent = 'Reconhecendo e traduzindo imagens...';
  const tab = await getActiveTab();
  if (!tab?.id) {
    statusOutput.textContent = 'Não foi possível acessar esta aba.';
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_PAGE' });
    if (response?.unsupported) {
      statusOutput.textContent = 'OCR nativo indisponível neste Chrome.';
    } else if (response?.translationSkipped) {
      statusOutput.textContent = `${response.processed ?? 0} imagem(ns) reconhecida(s). Configure a API para traduzir.`;
    } else {
      statusOutput.textContent = `${response?.processed ?? 0} imagem(ns) processada(s).`;
    }
  } catch {
    statusOutput.textContent = 'Recarregue a página e tente novamente.';
  }
});
