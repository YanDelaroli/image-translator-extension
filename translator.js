class NativeTranslationEngine {
  constructor() {
    this.detectorPromise = null;
    this.translators = new Map();
  }

  isSupported() {
    return 'Translator' in globalThis && 'LanguageDetector' in globalThis;
  }

  async createDetector() {
    if (!this.isSupported()) return null;
    const availability = await LanguageDetector.availability();
    if (availability === 'unavailable') return null;
    if (availability !== 'available' && !navigator.userActivation?.isActive) {
      const error = new Error('Ativação necessária para baixar o detector de idioma.');
      error.code = 'NATIVE_SETUP_REQUIRED';
      throw error;
    }
    this.detectorPromise ??= LanguageDetector.create();
    return this.detectorPromise;
  }

  async detectLanguage(text) {
    const detector = await this.createDetector();
    if (!detector) return null;
    const results = await detector.detect(text);
    return results?.find((item) => item.confidence >= 0.35)?.detectedLanguage || results?.[0]?.detectedLanguage || null;
  }

  async getTranslator(sourceLanguage, targetLanguage) {
    const key = `${sourceLanguage}:${targetLanguage}`;
    if (this.translators.has(key)) return this.translators.get(key);

    const availability = await Translator.availability({ sourceLanguage, targetLanguage });
    if (availability === 'unavailable') return null;
    if (availability !== 'available' && !navigator.userActivation?.isActive) {
      const error = new Error('Ativação necessária para baixar o pacote de tradução.');
      error.code = 'NATIVE_SETUP_REQUIRED';
      throw error;
    }

    const translator = await Translator.create({ sourceLanguage, targetLanguage });
    this.translators.set(key, translator);
    return translator;
  }

  async translate(text, targetLanguage) {
    if (!this.isSupported()) return { supported: false };
    const sourceLanguage = await this.detectLanguage(text);
    if (!sourceLanguage) return { supported: false };
    if (sourceLanguage === targetLanguage) {
      return { supported: true, translatedText: text, sourceLanguage, provider: 'chrome-native' };
    }

    const translator = await this.getTranslator(sourceLanguage, targetLanguage);
    if (!translator) return { supported: false, sourceLanguage };
    const translatedText = await translator.translate(text);
    return { supported: true, translatedText, sourceLanguage, provider: 'chrome-native' };
  }
}

globalThis.ImageTranslatorNative = new NativeTranslationEngine();
