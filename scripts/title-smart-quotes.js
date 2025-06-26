const typogr = require('typogr');

hexo.extend.filter.register('after_post_render', function (data) {
  if (data.title) {
    data.title = typogr.smartypants(data.title);
    data.description = typogr.smartypants(data.description || '');
  }
  return data;
});
