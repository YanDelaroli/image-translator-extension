# Image Translator Extension

Extensão Chrome Manifest V3 para reconhecer texto em imagens, traduzi-lo e desenhar o resultado sobre as regiões originais.

## Recursos atuais

- popup com ativação e idioma de destino;
- detecção de imagens estáticas e dinâmicas;
- OCR nativo com `TextDetector`, quando disponível;
- fallback para Tesseract.js empacotado localmente;
- tradução por endpoint compatível com LibreTranslate;
- chave de API opcional;
- cache de traduções e deduplicação de requisições simultâneas;
- sobreposições alinhadas durante rolagem e redimensionamento;
- texto original disponível no tooltip.

## Preparar a extensão

Requer Node.js 20 ou superior.

```bash
npm install
npm run build
```

O comando gera a pasta `dist/` e copia para ela o worker e o WebAssembly do Tesseract.js. O código executável do OCR fica dentro da própria extensão, conforme as exigências do Manifest V3.

Na primeira utilização do fallback Tesseract, os modelos de idioma `eng`, `por` e `spa` são baixados do repositório público de dados do Project Naptha.

## Instalar no Chrome

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `dist/`.
5. Configure opcionalmente um endpoint compatível com LibreTranslate.
6. Abra uma página com imagens contendo texto.
7. Ative a extensão e clique em **Analisar e traduzir página**.

## Limitações atuais

- a reconstrução do fundo atrás do texto ainda usa caixas opacas;
- imagens protegidas por CORS podem falhar em alguns cenários;
- o reconhecimento inicial do Tesseract é mais lento por causa do carregamento dos modelos;
- os idiomas OCR empacotados inicialmente são inglês, português e espanhol.

## Próximas etapas

- cache persistente de OCR por hash da imagem;
- agrupamento de palavras em linhas e parágrafos;
- reconstrução visual do fundo;
- suporte configurável a outros idiomas OCR;
- testes automatizados e pacote de distribuição.
