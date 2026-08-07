class ImageTranslatorVisualEngine {
  async sampleRegion(image, box) {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;

    try {
      context.drawImage(image, 0, 0);
      const padding = Math.max(3, Math.round(Math.min(box.width, box.height) * 0.08));
      const x = Math.max(0, Math.floor(box.x - padding));
      const y = Math.max(0, Math.floor(box.y - padding));
      const width = Math.min(canvas.width - x, Math.ceil(box.width + padding * 2));
      const height = Math.min(canvas.height - y, Math.ceil(box.height + padding * 2));
      const data = context.getImageData(x, y, width, height).data;
      if (!data.length) return null;

      let red = 0;
      let green = 0;
      let blue = 0;
      let samples = 0;
      const stride = Math.max(4, Math.floor(Math.sqrt((width * height) / 180)) * 4);

      for (let index = 0; index < data.length; index += stride) {
        const alpha = data[index + 3];
        if (alpha < 180) continue;
        red += data[index];
        green += data[index + 1];
        blue += data[index + 2];
        samples += 1;
      }

      if (!samples) return null;
      const background = {
        r: Math.round(red / samples),
        g: Math.round(green / samples),
        b: Math.round(blue / samples)
      };
      const luminance = (0.2126 * background.r + 0.7152 * background.g + 0.0722 * background.b) / 255;
      return {
        background: `rgba(${background.r},${background.g},${background.b},.96)`,
        foreground: luminance > 0.56 ? '#111' : '#fff',
        border: luminance > 0.56 ? 'rgba(0,0,0,.16)' : 'rgba(255,255,255,.2)'
      };
    } catch {
      return null;
    }
  }
}

globalThis.ImageTranslatorVisual = new ImageTranslatorVisualEngine();
