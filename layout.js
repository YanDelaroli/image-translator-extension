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
      .map((line) => this.mergeItems(line.items))
      .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  }

  groupIntoParagraphs(lines) {
    if (!lines.length) return [];
    const sorted = [...lines].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
    const paragraphs = [];

    for (const line of sorted) {
      const previous = paragraphs.at(-1);
      if (!previous) {
        paragraphs.push({ lines: [line] });
        continue;
      }

      const previousLine = previous.lines.at(-1);
      const verticalGap = line.box.y - (previousLine.box.y + previousLine.box.height);
      const averageHeight = (line.box.height + previousLine.box.height) / 2;
      const horizontalOverlap = this.overlapRatio(line.box, previousLine.box);
      const alignedLeft = Math.abs(line.box.x - previousLine.box.x) <= averageHeight * 1.5;
      const sameParagraph = verticalGap <= averageHeight * 1.15 && (horizontalOverlap >= 0.2 || alignedLeft);

      if (sameParagraph) previous.lines.push(line);
      else paragraphs.push({ lines: [line] });
    }

    return paragraphs.map(({ lines: paragraphLines }) => {
      const left = Math.min(...paragraphLines.map((line) => line.box.x));
      const top = Math.min(...paragraphLines.map((line) => line.box.y));
      const right = Math.max(...paragraphLines.map((line) => line.box.x + line.box.width));
      const bottom = Math.max(...paragraphLines.map((line) => line.box.y + line.box.height));
      return {
        text: paragraphLines.map((line) => line.text).join('\n'),
        box: { x: left, y: top, width: right - left, height: bottom - top },
        sourceLines: paragraphLines
      };
    });
  }

  mergeItems(items) {
    const sorted = [...items].sort((a, b) => a.box.x - b.box.x);
    const left = Math.min(...sorted.map((item) => item.box.x));
    const top = Math.min(...sorted.map((item) => item.box.y));
    const right = Math.max(...sorted.map((item) => item.box.x + item.box.width));
    const bottom = Math.max(...sorted.map((item) => item.box.y + item.box.height));
    return {
      text: this.joinWords(sorted),
      box: { x: left, y: top, width: right - left, height: bottom - top },
      sourceBlocks: sorted
    };
  }

  overlapRatio(a, b) {
    const left = Math.max(a.x, b.x);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const overlap = Math.max(0, right - left);
    return overlap / Math.max(1, Math.min(a.width, b.width));
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
