function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value.toArray === 'function') return value.toArray();
  return [value];
}

function absoluteUrl(value, baseUrl) {
  return new URL(value, baseUrl).href;
}

function isoDate(value) {
  return value && typeof value.toISOString === 'function' ? value.toISOString() : undefined;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function safeJsonStringify(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => {
    const escapes = {
      '<': '\\u003c',
      '>': '\\u003e',
      '&': '\\u0026',
      '\u2028': '\\u2028',
      '\u2029': '\\u2029'
    };
    return escapes[character];
  });
}

function buildAuthor(config, page, authorId) {
  const authorName = page.author || config.author;
  if (!authorName) return undefined;

  const author = {
    '@type': 'Person',
    name: authorName
  };

  // An explicit per-post author may identify someone other than the site owner.
  if (page.author && page.author !== config.author) return author;

  const jsonLd = config.json_ld || {};
  author['@id'] = authorId;
  if (jsonLd.author_url) author.url = absoluteUrl(jsonLd.author_url, config.url);

  const sameAs = asArray(jsonLd.author_same_as).filter(Boolean);
  if (sameAs.length) author.sameAs = sameAs;

  return author;
}

function buildImage(page, pageUrl) {
  const image = page.ogp_image;
  if (!image || !image.url) return undefined;

  const result = {
    '@type': 'ImageObject',
    url: absoluteUrl(image.url, pageUrl)
  };
  const width = positiveNumber(image.width);
  const height = positiveNumber(image.height);
  if (width) result.width = width;
  if (height) result.height = height;
  if (image.alt) result.caption = image.alt;
  return result;
}

hexo.extend.helper.register('json_ld', function () {
  const { config, page } = this;
  const jsonLd = config.json_ld || {};
  const siteUrl = absoluteUrl('/', config.url);
  const siteId = `${siteUrl}#website`;
  const authorUrl = absoluteUrl(jsonLd.author_url || '/about/', config.url);
  const authorId = `${authorUrl}#person`;

  if (this.is_post()) {
    const pageUrl = absoluteUrl(page.permalink || page.path, siteUrl);
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      '@id': `${pageUrl}#blogposting`,
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': pageUrl
      },
      url: pageUrl,
      headline: page.title,
      description: page.description || config.description,
      datePublished: isoDate(page.date),
      dateModified: isoDate(page.updated),
      author: buildAuthor(config, page, authorId),
      isPartOf: { '@id': siteId }
    };

    const keywords = asArray(page.tags)
      .map(tag => tag && (tag.name || tag))
      .filter(Boolean);
    if (keywords.length) structuredData.keywords = keywords;

    const image = buildImage(page, pageUrl);
    if (image) structuredData.image = image;

    return safeJsonStringify(structuredData);
  }

  // Only the domain root is eligible for WebSite site-name markup, not pagination.
  if (page.path === 'index.html') {
    const author = buildAuthor(config, page, authorId);
    const website = {
      '@type': 'WebSite',
      '@id': siteId,
      url: siteUrl,
      name: config.title,
      description: config.description,
      creator: { '@id': authorId }
    };
    if (jsonLd.site_alternate_name) website.alternateName = jsonLd.site_alternate_name;

    return safeJsonStringify({
      '@context': 'https://schema.org',
      '@graph': [website, author]
    });
  }

  if (page.type === 'about') {
    const pageUrl = absoluteUrl(page.permalink || page.path, siteUrl);
    return safeJsonStringify({
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      '@id': `${pageUrl}#profile-page`,
      url: pageUrl,
      name: page.title || config.title,
      description: page.description || config.description,
      mainEntity: buildAuthor(config, page, authorId)
    });
  }

  return '';
});
