import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_VIEW_PATHS,
  ViewPathError,
  isValidViewPath,
  normalizeViewCount,
  parseViewPaths,
  readViewCounts,
} from '../src/view-counts.mjs';

test('validates dated post paths and the KV key byte limit', () => {
  assert.equal(isValidViewPath('2026/07/13/example-post/'), true);
  assert.equal(isValidViewPath('blog_view_log:123'), false);
  assert.equal(isValidViewPath('2026/07/13/nested/path/'), false);
  assert.equal(isValidViewPath(`2026/07/13/${'界'.repeat(170)}/`), false);
});

test('parses and deduplicates one to twenty paths', () => {
  const params = new URLSearchParams();
  params.append('path', '2026/07/13/first/');
  params.append('path', '2026/07/13/first/');
  params.append('path', '2026/07/12/second/');

  assert.deepEqual(parseViewPaths(params), [
    '2026/07/13/first/',
    '2026/07/12/second/',
  ]);
});

test('rejects missing, excessive, and invalid paths', () => {
  assert.throws(() => parseViewPaths(new URLSearchParams()), ViewPathError);

  const excessive = new URLSearchParams();
  for (let index = 0; index <= MAX_VIEW_PATHS; index += 1) {
    excessive.append('path', `2026/07/13/post-${index}/`);
  }
  assert.throws(() => parseViewPaths(excessive), ViewPathError);

  const invalid = new URLSearchParams({ path: 'blog_view_log:123' });
  assert.throws(() => parseViewPaths(invalid), ViewPathError);
});

test('normalizes missing and malformed counts to zero', () => {
  assert.equal(normalizeViewCount('42'), 42);
  assert.equal(normalizeViewCount(null), 0);
  assert.equal(normalizeViewCount('-1'), 0);
  assert.equal(normalizeViewCount('not-a-number'), 0);
  assert.equal(normalizeViewCount(Number.MAX_SAFE_INTEGER + 1), 0);
});

test('uses one bulk KV read and returns every requested path', async () => {
  const paths = ['2026/07/13/first/', '2026/07/12/second/', '2026/07/11/missing/'];
  let reads = 0;
  const namespace = {
    async get(requestedPaths) {
      reads += 1;
      assert.deepEqual(requestedPaths, paths);
      return new Map([
        [paths[0], '12'],
        [paths[1], 'invalid'],
        [paths[2], null],
      ]);
    },
  };

  assert.deepEqual(await readViewCounts(namespace, paths), {
    [paths[0]]: 12,
    [paths[1]]: 0,
    [paths[2]]: 0,
  });
  assert.equal(reads, 1);
});
