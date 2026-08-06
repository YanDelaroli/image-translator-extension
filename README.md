# Image Translator Extension

Extensão Chrome Manifest V3 para detectar texto em imagens, traduzir o conteúdo e substituir visualmente o texto original.

## Estado atual

- popup com ativação e idioma de destino;
- detecção de imagens estáticas e dinâmicas;
- sobreposições alinhadas às imagens durante rolagem e redimensionamento;
- OCR experimental usando a API nativa `TextDetector`, quando disponível;
- renderização das caixas de texto reconhecidas sobre a imagem;
- fallback visível quando o navegador não oferece OCR nativo.

## Teste manual

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta do projeto.
5. Abra uma página com imagens contendo texto.
6. Ative a extensão e clique em **Analisar página**.

## Próximas etapas

A API `TextDetector` não está disponível em todas as versões do Chrome. A próxima implementação adicionará um motor OCR empacotado, como Tesseract.js, e depois conectará um provedor de tradução.
