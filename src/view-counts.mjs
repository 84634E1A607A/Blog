export const MAX_VIEW_PATHS = 20;

const MAX_KV_KEY_BYTES = 512;
const POST_PATH_PATTERN = /^\d{4}\/\d{2}\/\d{2}\/[^/?#]+\/$/u;
const textEncoder = new TextEncoder();

export class ViewPathError extends Error {}

export function isValidViewPath(path) {
  return typeof path === 'string'
    && POST_PATH_PATTERN.test(path)
    && textEncoder.encode(path).byteLength <= MAX_KV_KEY_BYTES;
}

export function parseViewPaths(searchParams) {
  const requestedPaths = searchParams.getAll('path');
  if (requestedPaths.length === 0 || requestedPaths.length > MAX_VIEW_PATHS) {
    throw new ViewPathError(`Expected between 1 and ${MAX_VIEW_PATHS} view paths`);
  }

  if (requestedPaths.some(path => !isValidViewPath(path))) {
    throw new ViewPathError('One or more view paths are invalid');
  }

  return [...new Set(requestedPaths)];
}

export function normalizeViewCount(value) {
  const count = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

export async function readViewCounts(namespace, paths) {
  const values = await namespace.get(paths);
  if (!(values instanceof Map)) throw new TypeError('KV bulk read did not return a Map');

  return Object.fromEntries(paths.map(path => [path, normalizeViewCount(values.get(path))]));
}
