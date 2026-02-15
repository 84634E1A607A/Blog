let mdParser = null;

hexo.extend.filter.register('markdown-it:renderer', function (md) {
  mdParser = md;
});

function smartenPlainText(text) {
  if (!mdParser || !text) return text;

  const tokens = mdParser.parseInline(text, {});
  const inline = tokens[0];
  const children = inline && inline.children ? inline.children : null;
  if (!children || children.length === 0) return text;

  // Only apply typographer output when input is plain text.
  // If markdown syntax is present, keep original text to avoid emitting HTML.
  if (children.some(token => token.type !== 'text')) return text;

  return children.map(token => token.content).join('');
}

hexo.extend.filter.register('after_post_render', function (data) {
  if (data.title) data.title = smartenPlainText(data.title);
  if (data.description) data.description = smartenPlainText(data.description);
  return data;
});
