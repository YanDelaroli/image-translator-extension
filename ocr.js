class ImageTranslatorOcrEngine {
  constructor() {
    this.nativeDetector = null;
    this.tesseractWorkerPromise = null;
  }

  getEngineName() {
    if ('TextDetector' in globalThis) return 'TextDetector';
    if (globalThis.Tesseract?.createWorker) return 'Tesseract.js';
    return null;
  }

  isSupported() {
    return Boolean(this.getEngineName());
  }

  async getTesseractWorker() {
    if (!globalThis.Tesseract?.createWorker) {
      throw new Error('Tesseract.js não foi empacotado na extensão.');
    }

    this.tesseractWorkerPromise ??= globalThis.Tesseract.createWorker('eng+por+spa', 1, {
      workerPath: chrome.runtime.getURL('vendor/worker.min.js'),
      corePath: chrome.runtime.getURL('vendor/tesseract-core.wasm.js'),
      langPath: 'https://tessdata.projectnaptha.com/4.0.0'
    }).then(async (worker) => {
      await worker.setParameters({ preserve_interword_spaces: '1' });
      return worker;
    });

    return this.tesseractWorkerPromise;
  }

  async recognizeWithNativeDetector(image) {
    this.nativeDetector ??= new TextDetector();
    const results = await this.nativeDetector.detect(image);

    return results
      .map((item) => ({
        text: item.rawValue?.trim() || '',
        confidence: 1,
        box: {
          x: item.boundingBox.x,
          y: item.boundingBox.y,
          width: item.boundingBox.width,
          height: item.boundingBox.height
        }
      }))
      .filter((item) => item.text);
  }

  flattenTesseractBlocks(blocks) {
    const output = [];

    for (const block of blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const line of paragraph.lines || []) {
          const words = line.words || [];
          if (words.length) {
            for (const word of words) {
              const text = word.text?.trim() || '';
              const bbox = word.bbox;
              const confidence = Number(word.confidence ?? line.confidence ?? 0) / 100;
              if (!text || !bbox || confidence < 0.25) continue;
              output.push({
                text,
                confidence,
                box: {
                  x: bbox.x0,
                  y: bbox.y0,
                  width: bbox.x1 - bbox.x0,
                  height: bbox.y1 - bbox.y0
                }
              });
            }
            continue;
          }

          const text = line.text?.trim() || '';
          const bbox = line.bbox;
          if (!text || !bbox) continue;
          output.push({
            text,
            confidence: Number(line.confidence || 0) / 100,
            box: {
              x: bbox.x0,
              y: bbox.y0,
              width: bbox.x1 - bbox.x0,
              height: bbox.y1 - bbox.y0
            }
          });
        }
      }
    }

    return output;
  }

  async recognizeWithTesseract(image) {
    const worker = await this.getTesseractWorker();
    const result = await worker.recognize(image, {}, { blocks: true });
    return this.flattenTesseractBlocks(result?.data?.blocks);
  }

  async recognize(image) {
    const engine = this.getEngineName();
    if (!engine) {
      throw new Error('Nenhum motor OCR está disponível. Execute npm install e npm run build.');
    }

    return engine === 'TextDetector'
      ? this.recognizeWithNativeDetector(image)
      : this.recognizeWithTesseract(image);
  }
}

globalThis.ImageTranslatorOcr = new ImageTranslatorOcrEngine();
