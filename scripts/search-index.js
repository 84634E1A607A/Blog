'use strict';

const { createSearchEntry } = require('../lib/search-index');

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
