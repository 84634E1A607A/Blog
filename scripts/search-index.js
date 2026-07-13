'use strict';

const { stripHTML, unescapeHTML } = require('hexo-util');

const BLOCK_TAG_PATTERN = /<\/?(?:address|article|aside|blockquote|br|dd|details|dialog|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|summary|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi;
const NON_VISIBLE_CONTENT_PATTERN = /<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi;

function imageAltText(attributes) {
  const match = attributes.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return match ? ` ${match[1] ?? match[2] ?? match[3]} ` : ' ';
}

function htmlToSearchText(html) {
  const visibleHtml = String(html || '')
    .replace(NON_VISIBLE_CONTENT_PATTERN, ' ')
    .replace(/<img\b([^>]*)>/gi, (_image, attributes) => imageAltText(attributes))
    .replace(BLOCK_TAG_PATTERN, ' ');

  return unescapeHTML(stripHTML(visibleHtml)).replace(/\s+/gu, ' ').trim();
}

function rootRelativeUrl(root, path) {
  const configuredRoot = root || '/';
  const normalizedRoot = configuredRoot.endsWith('/') ? configuredRoot : `${configuredRoot}/`;
  return `${normalizedRoot}${String(path || '').replace(/^\/+/, '')}`;
}

function createSearchEntry(post, root) {
  return {
    title: htmlToSearchText(post.title),
    url: rootRelativeUrl(root, post.path),
    content: htmlToSearchText(post.content),
  };
}

hexo.extend.generator.register('search-index', locals => {
  const entries = locals.posts
    .sort('-date')
    .filter(post => post.indexing !== false)
    .map(post => createSearchEntry(post, hexo.config.root));

  return {
    path: 'search.json',
    data: JSON.stringify(entries),
  };
});
