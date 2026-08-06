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

  async recognizeWithTesseract(image) {
    const worker = await this.getTesseractWorker();
    const result = await worker.recognize(image);
    const words = result?.data?.words || [];

    return words
      .map((word) => ({
        text: word.text?.trim() || '',
        confidence: Number(word.confidence || 0) / 100,
        box: {
          x: word.bbox.x0,
          y: word.bbox.y0,
          width: word.bbox.x1 - word.bbox.x0,
          height: word.bbox.y1 - word.bbox.y0
        }
      }))
      .filter((item) => item.text && item.confidence >= 0.35);
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
