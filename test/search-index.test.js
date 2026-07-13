'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createSearchEntry,
  htmlToSearchText,
  rootRelativeUrl,
} = require('../lib/search-index');

test('converts rendered HTML to normalized visitor-visible text', () => {
  const html = `
    <article class="class-only-marker">
      <h2>Heading &amp; details</h2>
      <p>First <strong>paragraph</strong>.</p>
      <img src="ignored.png" alt="Diagram &quot;label&quot;">
      <pre><code>const answer = 42;</code></pre>
      <script>window.hiddenMarker = true</script>
      <style>.hidden-style-marker { color: red; }</style>
      <template>hidden template marker</template>
    </article>`;

  assert.equal(
    htmlToSearchText(html),
    'Heading & details First paragraph. Diagram "label" const answer = 42;',
  );
});

test('builds the compact title, URL, and content schema', () => {
  assert.deepEqual(createSearchEntry({
    title: 'A <em>compact</em> title',
    path: '2026/07/13/example/',
    content: '<p>Visible body</p>',
  }, '/blog/'), {
    title: 'A compact title',
    url: '/blog/2026/07/13/example/',
    content: 'Visible body',
  });
});

test('normalizes root-relative URLs', () => {
  assert.equal(rootRelativeUrl('/', '/2026/07/13/example/'), '/2026/07/13/example/');
  assert.equal(rootRelativeUrl('/blog', 'post/'), '/blog/post/');
  assert.equal(rootRelativeUrl(undefined, 'post/'), '/post/');
});
