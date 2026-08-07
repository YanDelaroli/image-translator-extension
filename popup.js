const enabledInput = document.querySelector('#enabled');
const languageSelect = document.querySelector('#targetLanguage');
const endpointInput = document.querySelector('#translationEndpoint');
const apiKeyInput = document.querySelector('#translationApiKey');
const scanButton = document.querySelector('#scan');
const scanScreenButton = document.querySelector('#scanScreen');
const scanFullPageButton = document.querySelector('#scanFullPage');
const clearCacheButton = document.querySelector('#clearCache');
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
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings }).catch(() => {});
}

chrome.storage.sync.get({ enabled: false, targetLanguage: 'pt', translationEndpoint: '', translationApiKey: '' }, (settings) => {
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
  statusOutput.textContent = 'Endpoint de fallback salvo.';
});
apiKeyInput.addEventListener('change', async () => {
  await sendSettings();
  statusOutput.textContent = 'Chave de fallback salva.';
});

scanButton.addEventListener('click', async () => {
  await sendSettings();
  statusOutput.textContent = 'Reconhecendo e traduzindo imagens...';
  const tab = await getActiveTab();
  if (!tab?.id) return void (statusOutput.textContent = 'Não foi possível acessar esta aba.');
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_PAGE' });
    if (response?.unsupported) statusOutput.textContent = 'Nenhum motor OCR disponível.';
    else if (response?.nativeSetupRequired) statusOutput.textContent = 'Clique em “Ativar tradução local” sobre a imagem.';
    else if (response?.translationSkipped) statusOutput.textContent = `${response.processed ?? 0} imagem(ns) reconhecida(s), mas não traduzida(s).`;
    else statusOutput.textContent = `${response?.processed ?? 0} imagem(ns) processada(s).`;
  } catch {
    statusOutput.textContent = 'Recarregue a página e tente novamente.';
  }
});

scanScreenButton.addEventListener('click', async () => {
  await sendSettings();
  statusOutput.textContent = 'Capturando e analisando a área visível...';
  const tab = await getActiveTab();
  if (!tab?.id) return void (statusOutput.textContent = 'Não foi possível acessar esta aba.');
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_VISIBLE_TAB' });
    if (response?.error) statusOutput.textContent = `Falha: ${response.error}`;
    else if (response?.reason === 'no_text') statusOutput.textContent = 'Nenhum texto foi encontrado na área visível.';
    else if (response?.nativeSetupRequired) statusOutput.textContent = 'Texto reconhecido. A tradução local precisa ser ativada no Chrome.';
    else statusOutput.textContent = `${response?.blocks ?? 0} bloco(s) traduzido(s) na área visível.`;
  } catch {
    statusOutput.textContent = 'Não foi possível capturar esta página.';
  }
});

scanFullPageButton.addEventListener('click', async () => {
  await sendSettings();
  scanFullPageButton.disabled = true;
  statusOutput.textContent = 'Percorrendo e traduzindo a página inteira...';
  const tab = await getActiveTab();
  if (!tab?.id) {
    scanFullPageButton.disabled = false;
    return void (statusOutput.textContent = 'Não foi possível acessar esta aba.');
  }
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_FULL_PAGE' });
    if (response?.error) statusOutput.textContent = `Falha: ${response.error}`;
    else if (!response?.blocks) statusOutput.textContent = 'Nenhum texto foi encontrado na página.';
    else if (response?.nativeSetupRequired) statusOutput.textContent = `${response.blocks} bloco(s) reconhecido(s). A tradução local precisa ser ativada.`;
    else if (response?.truncated) statusOutput.textContent = `${response.blocks} bloco(s) traduzido(s). A página excedeu o limite de capturas.`;
    else statusOutput.textContent = `${response.blocks} bloco(s) traduzido(s) em ${response.processed} trecho(s).`;
  } catch {
    statusOutput.textContent = 'Não foi possível capturar a página inteira.';
  } finally {
    scanFullPageButton.disabled = false;
  }
});

clearCacheButton.addEventListener('click', async () => {
  clearCacheButton.disabled = true;
  statusOutput.textContent = 'Limpando caches...';
  try {
    const tab = await getActiveTab();
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'CLEAR_SCREEN_OVERLAY' }).catch(() => {});
    const response = await chrome.runtime.sendMessage({ type: 'CLEAR_CACHES' });
    statusOutput.textContent = response?.ok ? `${response.removed ?? 0} entrada(s) removida(s).` : 'Não foi possível limpar os caches.';
  } catch {
    statusOutput.textContent = 'Não foi possível limpar os caches.';
  } finally {
    clearCacheButton.disabled = false;
  }
});
