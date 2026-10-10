// Reading the URL hash the site routes on: '#/listen/7?t=90' is the path
// 'listen/7' and the query 't=90'. Pure; no DOM.

/** Split a hash like '#/listen/7?t=90' into { path: 'listen/7', query: URLSearchParams }. */
export function splitHash(hash) {
  const [path, query = ''] = String(hash).replace(/^#\/?/, '').split(/\?(.*)/s);
  return { path: path.replace(/\/+$/, ''), query: new URLSearchParams(query) };
}
