// Where the data comes from: the talasaman.is open API, and the static files
// in data/ (map polygons and the tables snapshot).

export const API = 'https://talasaman.is/api/v1';

/** Fetch a URL as JSON, throwing on HTTP errors. */
export async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/** Fetch one API endpoint, e.g. 'places' → { data, meta }. */
export const fetchEndpoint = (name) => fetchJson(`${API}/${name}`);

const cache = new Map();

/**
 * Fetch a static JSON file once per page load; later calls share the result.
 * A failed fetch is forgotten so the next call can retry.
 */
export function loadJsonOnce(url) {
  if (!cache.has(url)) {
    cache.set(url, fetchJson(url).catch((err) => {
      cache.delete(url);
      throw err;
    }));
  }
  return cache.get(url);
}
