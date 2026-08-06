# Image Translator Extension

Extensão Chrome Manifest V3 para reconhecer texto em imagens, traduzi-lo localmente e desenhar o resultado sobre as regiões originais.

## Recursos atuais

- detecção de imagens estáticas e dinâmicas;
- OCR nativo com `TextDetector`, quando disponível;
- fallback para Tesseract.js empacotado localmente;
- agrupamento geométrico de palavras em linhas e parágrafos;
- tradução local com as APIs `LanguageDetector` e `Translator` do Chrome;
- endpoint compatível com LibreTranslate apenas como fallback opcional;
- cache de traduções e cache persistente de OCR;
- reconstrução visual aproximada com cor amostrada da imagem;
- ajuste automático da fonte e texto original no tooltip;
- botão para limpar caches.

## Preparar a extensão

Requer Node.js 20 ou superior.

```bash
npm install
npm run build
```

O comando gera a pasta `dist/` e inclui todos os módulos da extensão, o worker e o WebAssembly do Tesseract.js.

## Instalar no Chrome

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `dist/`.
5. Abra uma página com imagens contendo texto.
6. Ative a extensão e clique em **Analisar e traduzir página**.

## Primeiro uso da tradução local

O Chrome pode precisar baixar o detector de idioma e o pacote de tradução na primeira utilização. Quando isso for necessário, a extensão mostra o botão **Ativar tradução local** sobre a imagem. Clique nele uma vez para autorizar o download. Depois disso, a tradução funciona localmente sem chave de API.

A tradução nativa requer Chrome 138 ou mais recente em computador. Caso ela não esteja disponível, você ainda pode configurar um endpoint compatível com LibreTranslate na seção avançada do popup.

## Cache de OCR

A identidade da imagem é calculada a partir da URL atual e das dimensões naturais. O resultado bruto do OCR é salvo em `chrome.storage.local` por sete dias, evitando processamento repetido.

## Limitações atuais

- os idiomas OCR iniciais do Tesseract são inglês, português e espanhol;
- textos inclinados, curvos, verticais ou com colunas próximas podem ser agrupados incorretamente;
- fundos com gradientes e texturas complexas ainda podem parecer artificiais;
- imagens protegidas por CORS usam um fundo de segurança;
- a primeira execução pode ser mais lenta devido ao download dos modelos.
