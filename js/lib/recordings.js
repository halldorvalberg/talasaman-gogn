// The summary recordings: the /summaries rows that have audio, in the API's
// order. That order is the Audio page's, and recording numbers in the
// listening view's address (#/listen/7) count in it.

import { fetchEndpoint } from './data.js';

/** The rows of /summaries that come with a recording, in order. */
export const recordingsOf = (rows) => rows.filter((row) => row.audio);

/** Fetch the summaries that come with a recording. */
export async function fetchRecordings() {
  const { data } = await fetchEndpoint('summaries');
  return recordingsOf(data);
}
