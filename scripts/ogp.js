const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const fontkit = require('fontkit');
const LineBreaker = require('@foliojs-fork/linebreak');
const { renderAsync } = require('@resvg/resvg-js');

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
const TEXT_LEFT = 500;
const TEXT_RIGHT = 1140;
const TEXT_WIDTH = TEXT_RIGHT - TEXT_LEFT;
const TITLE_COLOR = '#4a303a';
const DESCRIPTION_COLOR = '#a58691';
const TITLE_MAX_LINES = 3;
const DESCRIPTION_MAX_LINES = 5;
const OGP_METADATA_KEY = 'hexo-ogp';
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function asArray(value) {
  if (!value) return [];
  return typeof value.toArray === 'function' ? value.toArray() : Array.from(value);
}

function escapeXml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;'
  })[character]);
}

function isCjk(character) {
  const point = character.codePointAt(0);
  return (
    (point >= 0x2e80 && point <= 0x9fff) ||
    (point >= 0xf900 && point <= 0xfaff) ||
    (point >= 0x3000 && point <= 0x303f) ||
    (point >= 0xff00 && point <= 0xffef)
  );
}

function fontFor(character, weight, fonts) {
  if (isCjk(character)) return weight >= 900 ? fonts.cjkBlack : fonts.cjkRegular;
  return weight >= 900 ? fonts.latinBlack : fonts.latinRegular;
}

function textWidth(text, fontSize, weight, fonts) {
  let width = 0;
  let currentFont;
  let currentText = '';

  const measureRun = () => {
    if (!currentText) return;
    width += currentFont.layout(currentText).advanceWidth * fontSize / currentFont.unitsPerEm;
  };

  for (const character of Array.from(text)) {
    const font = fontFor(character, weight, fonts);
    if (currentFont && font !== currentFont) {
      measureRun();
      currentText = '';
    }
    currentFont = font;
    currentText += character;
  }
  measureRun();
  return width;
}

function ellipsizeAtBreak(text, maxWidth, fontSize, weight, fonts) {
  const breaker = new LineBreaker(text.trimEnd());
  let best = '';
  let breakpoint;
  while ((breakpoint = breaker.nextBreak())) {
    const candidate = text.slice(0, breakpoint.position).trimEnd();
    if (textWidth(`${candidate}…`, fontSize, weight, fonts) <= maxWidth) best = candidate;
  }
  return best ? `${best}…` : '…';
}

function wrapText(text, maxWidth, fontSize, weight, fonts, maxLines) {
  const normalized = String(text || '').replace(/\s+/gu, ' ').trim();
  if (!normalized) return [];

  const lines = [];
  const breaker = new LineBreaker(normalized);
  let lastPosition = 0;
  let line = '';
  let breakpoint;

  while ((breakpoint = breaker.nextBreak())) {
    const segment = normalized.slice(lastPosition, breakpoint.position);
    const candidate = line + segment;
    if (line && textWidth(candidate, fontSize, weight, fonts) > maxWidth) {
      lines.push(line.trimEnd());
      if (lines.length === maxLines) {
        lines[lines.length - 1] = ellipsizeAtBreak(line, maxWidth, fontSize, weight, fonts);
        return lines;
      }
      line = segment.trimStart();
    } else {
      line = candidate;
    }
    if (breakpoint.required) {
      if (line.trim()) lines.push(line.trimEnd());
      if (lines.length === maxLines) return lines;
      line = '';
    }
    lastPosition = breakpoint.position;
  }

  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

function fontRuns(line, weight, fonts) {
  const runs = [];
  let currentFont;
  let currentText = '';

  for (const character of Array.from(line)) {
    const font = fontFor(character, weight, fonts);
    if (currentFont && font !== currentFont) {
      runs.push({ font: currentFont, text: currentText });
      currentText = '';
    }
    currentFont = font;
    currentText += character;
  }
  if (currentText) runs.push({ font: currentFont, text: currentText });

  return runs;
}

function textPaths(line, x, baseline, fontSize, weight, color, fonts) {
  const glyphs = fontRuns(line, weight, fonts).flatMap(run => {
    const layout = run.font.layout(run.text);
    return layout.glyphs.map((glyph, index) => ({
      glyph,
      position: layout.positions[index],
      font: run.font
    }));
  });

  let cursor = x;
  return glyphs.map((item, index) => {
    const { glyph, position, font } = item;
    const fontScale = fontSize / font.unitsPerEm;
    const pathData = glyph.path.toSVG();
    const transform = `translate(${cursor + position.xOffset * fontScale} ${baseline - position.yOffset * fontScale}) scale(${fontScale} ${-fontScale})`;
    cursor += position.xAdvance * fontScale;
    if (index < glyphs.length - 1) cursor -= 1;
    return pathData ? `<path d="${pathData}" transform="${transform}" fill="${color}"/>` : '';
  }).join('');
}

function titleLayout(title, fonts) {
  const compactTitle = String(title).replace(/\s+/gu, '');
  for (let fontSize = 58; fontSize >= 38; fontSize -= 2) {
    const lines = wrapText(title, TEXT_WIDTH, fontSize, 900, fonts, TITLE_MAX_LINES);
    const compactLines = lines.join('').replace(/\s+/gu, '').replace(/…$/u, '');
    if (lines.length <= TITLE_MAX_LINES && compactLines === compactTitle && lines.every(line => textWidth(line, fontSize, 900, fonts) <= TEXT_WIDTH)) {
      return { fontSize, lineHeight: Math.round(fontSize * 1.23), lines };
    }
  }
  const fontSize = 38;
  return {
    fontSize,
    lineHeight: 47,
    lines: wrapText(title, TEXT_WIDTH, fontSize, 900, fonts, TITLE_MAX_LINES)
  };
}

function pageTitle(page, config) {
  return String(page.title || config.title || '').trim() || 'Ajax’s Blog';
}

function pageDescription(page, config) {
  return String(page.description || config.description || '').trim();
}

function stablePostCardPath(page) {
  const key = page.path || page.source || page.slug || page.title;
  const id = createHash('sha256').update(String(key)).digest('hex').slice(0, 24);
  return `/ogp/${id}.png`;
}

function resolveOgpImage(page, config, isPost) {
  if (page.ogp_image && page.ogp_image.url) {
    return {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      alt: `Open Graph image for ${pageTitle(page, config)}`,
      ...page.ogp_image
    };
  }

  const relativeUrl = isPost ? stablePostCardPath(page) : '/ogp/site.png';
  const url = `${String(config.url || '').replace(/\/+$/u, '')}${relativeUrl}`;
  return {
    url,
    width: Number(config.ogp?.width) || CARD_WIDTH,
    height: Number(config.ogp?.height) || CARD_HEIGHT,
    alt: `Open Graph image for ${pageTitle(page, config)}`
  };
}

function renderText(lines, x, baseline, lineHeight, fontSize, weight, color, fonts) {
  return lines.map((line, index) => (
    textPaths(line, x, baseline + index * lineHeight, fontSize, weight, color, fonts)
  )).join('');
}

function buildSvg({ background, title, description, fonts }) {
  const titleLayoutResult = titleLayout(title, fonts);
  const descriptionLines = wrapText(description, TEXT_WIDTH, 25, 400, fonts, DESCRIPTION_MAX_LINES);
  const descriptionLineHeight = 33;
  const titleHeight = titleLayoutResult.lines.length * titleLayoutResult.lineHeight;
  const descriptionHeight = descriptionLines.length * descriptionLineHeight;
  const totalHeight = titleHeight + (descriptionLines.length ? 34 + descriptionHeight : 0);
  const firstTitleBaseline = Math.max(145, Math.round((CARD_HEIGHT - totalHeight) / 2) + titleLayoutResult.fontSize - 24);
  const descriptionBaseline = firstTitleBaseline + titleHeight + 24;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <image href="data:image/jpeg;base64,${background.toString('base64')}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}"/>
  ${renderText(titleLayoutResult.lines, TEXT_LEFT, firstTitleBaseline, titleLayoutResult.lineHeight, titleLayoutResult.fontSize, 900, TITLE_COLOR, fonts)}
  ${renderText(descriptionLines, TEXT_LEFT, descriptionBaseline, descriptionLineHeight, 25, 400, DESCRIPTION_COLOR, fonts)}
  <text x="${TEXT_RIGHT}" y="574" text-anchor="end" fill="${TITLE_COLOR}" font-family="Allura" font-size="44" font-weight="400">Ajax&apos;s Blog</text>
</svg>`;
}

function assetPaths(baseDir, config) {
  const ogp = config.ogp || {};
  return {
    background: path.resolve(baseDir, ogp.background || 'assets/ogp/background.jpg'),
    notoRegular: path.resolve(baseDir, 'assets/ogp/fonts/NotoSansCJKsc-Regular.otf'),
    notoBlack: path.resolve(baseDir, 'assets/ogp/fonts/NotoSansCJKsc-Black.otf'),
    robotoRegular: path.resolve(baseDir, 'assets/ogp/fonts/Roboto-Regular.ttf'),
    robotoBlack: path.resolve(baseDir, 'assets/ogp/fonts/Roboto-Black.ttf'),
    allura: path.resolve(baseDir, 'themes/Nlvi/source/font/allura/allura.ttf')
  };
}

function measurementFonts(assets) {
  return {
    cjkRegular: fontkit.openSync(assets.notoRegular),
    cjkBlack: fontkit.openSync(assets.notoBlack),
    latinRegular: fontkit.openSync(assets.robotoRegular),
    latinBlack: fontkit.openSync(assets.robotoBlack)
  };
}

async function renderCard(input, assets, fonts) {
  const svg = buildSvg({ ...input, fonts });
  const image = await renderAsync(svg, {
    fitTo: { mode: 'original' },
    font: {
      loadSystemFonts: false,
      fontFiles: [assets.notoRegular, assets.notoBlack, assets.robotoRegular, assets.robotoBlack, assets.allura]
    }
  });
  return image.asPng();
}

function readOgpMetadata(png) {
  if (!png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return undefined;

  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > png.length) return undefined;

    if (type === 'iTXt') {
      const data = png.subarray(dataStart, dataEnd);
      const keywordEnd = data.indexOf(0);
      if (keywordEnd !== -1 && data.toString('latin1', 0, keywordEnd) === OGP_METADATA_KEY) {
        const compressionFlag = data[keywordEnd + 1];
        const languageEnd = data.indexOf(0, keywordEnd + 3);
        const translatedKeywordEnd = languageEnd === -1 ? -1 : data.indexOf(0, languageEnd + 1);
        if (compressionFlag === 0 && translatedKeywordEnd !== -1) {
          return data.toString('utf8', translatedKeywordEnd + 1);
        }
      }
    }
    offset = dataEnd + 4;
  }
  return undefined;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuffer, data])) >>> 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function addOgpMetadata(png, metadata) {
  const data = Buffer.concat([
    Buffer.from(OGP_METADATA_KEY, 'latin1'),
    Buffer.from([0, 0, 0, 0, 0]),
    Buffer.from(metadata, 'utf8')
  ]);
  const metadataChunk = pngChunk('iTXt', data);
  const chunks = [png.subarray(0, PNG_SIGNATURE.length)];
  let offset = PNG_SIGNATURE.length;

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const end = offset + length + 12;
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IEND') chunks.push(metadataChunk);
    chunks.push(png.subarray(offset, end));
    offset = end;
  }
  return Buffer.concat(chunks);
}

function cardMetadata(card) {
  return JSON.stringify({
    sourcePath: card.sourcePath,
    title: card.title,
    description: card.description
  });
}

async function hasMatchingCard(file, metadata) {
  try {
    return readOgpMetadata(await fs.readFile(file)) === metadata;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function forEachConcurrent(items, limit, iteratee) {
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await iteratee(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

async function generateCards(hexo) {
  const assets = assetPaths(hexo.base_dir, hexo.config);
  const background = await fs.readFile(assets.background);
  const fonts = measurementFonts(assets);
  const outputDir = path.join(hexo.public_dir, 'ogp');
  await fs.mkdir(outputDir, { recursive: true });

  const postCards = asArray(hexo.locals.get('posts'))
    .filter(post => post.published !== false && !(post.ogp_image && post.ogp_image.url))
    .map(post => ({
      file: path.join(hexo.public_dir, stablePostCardPath(post)),
      sourcePath: post.source || post.path,
      title: pageTitle(post, hexo.config),
      description: pageDescription(post, hexo.config)
    }));
  const siteCard = {
    file: path.join(hexo.public_dir, 'ogp/site.png'),
    sourcePath: 'site',
    title: hexo.config.title,
    description: hexo.config.description
  };

  const cards = [...postCards, siteCard];
  const concurrency = Math.min(4, os.availableParallelism());
  let rendered = 0;
  let reused = 0;
  await forEachConcurrent(cards, concurrency, async card => {
    const metadata = cardMetadata(card);
    if (await hasMatchingCard(card.file, metadata)) {
      reused += 1;
      return;
    }
    await fs.mkdir(path.dirname(card.file), { recursive: true });
    const png = await renderCard({ ...card, background }, assets, fonts);
    await fs.writeFile(card.file, addOgpMetadata(png, metadata));
    rendered += 1;
  });
  hexo.log.info(`OGP cards: ${rendered} rendered, ${reused} reused`);
}

hexo.extend.helper.register('resolved_ogp_image', function(page, isPost) {
  return resolveOgpImage(page, this.config || hexo.config, isPost);
});

hexo.extend.filter.register('after_generate', function() {
  return generateCards(hexo);
});
