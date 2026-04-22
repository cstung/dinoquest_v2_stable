function extractVideoId(youtubeUrl) {
  const url = String(youtubeUrl || '').trim();
  const match = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  if (!match) throw new Error('Invalid YouTube URL');
  return match[1];
}

async function fetchSupadataTranscript(youtubeUrl, lang) {
  const encodedUrl = encodeURIComponent(youtubeUrl);
  const base = 'https://api.supadata.ai/v1/youtube/transcript';
  const endpoint = lang ? `${base}?url=${encodedUrl}&lang=${encodeURIComponent(lang)}` : `${base}?url=${encodedUrl}`;

  const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
    ? AbortSignal.timeout(15000)
    : undefined;

  const res = await fetch(endpoint, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supadata error (${res.status}): ${text || 'request failed'}`);
  }

  const data = await res.json();
  const items = Array.isArray(data?.content) ? data.content : [];
  const joined = items.map((x) => x?.text).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  if (joined.length <= 100) {
    throw new Error('Transcript too short');
  }

  return { text: joined, source: endpoint };
}

export async function fetchTranscriptClientSide(youtubeUrl) {
  const url = String(youtubeUrl || '').trim();
  extractVideoId(url); // validates supported formats

  const attempts = [
    () => fetchSupadataTranscript(url, 'vi'),
    () => fetchSupadataTranscript(url, 'en'),
    () => fetchSupadataTranscript(url, null),
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result?.text && result.text.length > 100) return result;
    } catch (e) {
      lastError = e;
    }
  }

  const err = new Error('Could not retrieve transcript for this video.');
  err.cause = lastError;
  throw err;
}

