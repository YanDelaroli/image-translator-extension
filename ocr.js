class BrowserOcrEngine {
  constructor() {
    this.detector = null;
  }

  isSupported() {
    return 'TextDetector' in globalThis;
  }

  async recognize(image) {
    if (!this.isSupported()) {
      throw new Error('OCR nativo não está disponível neste navegador.');
    }

    this.detector ??= new TextDetector();
    const results = await this.detector.detect(image);

    return results
      .map((item) => ({
        text: item.rawValue?.trim() || '',
        box: {
          x: item.boundingBox.x,
          y: item.boundingBox.y,
          width: item.boundingBox.width,
          height: item.boundingBox.height
        }
      }))
      .filter((item) => item.text);
  }
}

globalThis.ImageTranslatorOcr = new BrowserOcrEngine();
