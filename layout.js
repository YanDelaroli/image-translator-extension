class TextLayoutEngine {
  groupIntoLines(blocks) {
    const normalized = blocks
      .filter((block) => block?.text?.trim() && block?.box)
      .map((block) => ({ ...block, text: block.text.trim() }))
      .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);

    const lines = [];

    for (const block of normalized) {
      const centerY = block.box.y + block.box.height / 2;
      const tolerance = Math.max(8, block.box.height * 0.65);
      let line = lines.find((candidate) => Math.abs(candidate.centerY - centerY) <= Math.max(candidate.tolerance, tolerance));

      if (!line) {
        line = { items: [], centerY, tolerance };
        lines.push(line);
      }

      line.items.push(block);
      const heights = line.items.map((item) => item.box.height);
      line.centerY = line.items.reduce((sum, item) => sum + item.box.y + item.box.height / 2, 0) / line.items.length;
      line.tolerance = Math.max(8, Math.max(...heights) * 0.65);
    }

    return lines
      .map((line) => {
        const items = line.items.sort((a, b) => a.box.x - b.box.x);
        const left = Math.min(...items.map((item) => item.box.x));
        const top = Math.min(...items.map((item) => item.box.y));
        const right = Math.max(...items.map((item) => item.box.x + item.box.width));
        const bottom = Math.max(...items.map((item) => item.box.y + item.box.height));

        return {
          text: this.joinWords(items),
          box: { x: left, y: top, width: right - left, height: bottom - top },
          sourceBlocks: items
        };
      })
      .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  }

  joinWords(items) {
    return items.reduce((text, item, index) => {
      if (index === 0) return item.text;
      const previous = items[index - 1];
      const gap = item.box.x - (previous.box.x + previous.box.width);
      const averageHeight = (item.box.height + previous.box.height) / 2;
      const separator = gap > averageHeight * 0.35 ? ' ' : '';
      return `${text}${separator}${item.text}`;
    }, '');
  }
}

globalThis.ImageTranslatorLayout = new TextLayoutEngine();
