function extractVideoId(youtubeUrl) {
  const url = String(youtubeUrl || '').trim();
  const match = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  if (!match) throw new Error('Invalid YouTube URL');
  return match[1];
}

async function fetchOEmbedMeta(videoId) {
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;

  const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
    ? AbortSignal.timeout(8000)
    : undefined;

  const res = await fetch(oembedUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!res.ok) throw new Error('oEmbed request failed');
  const data = await res.json();
  return {
    title: String(data?.title || '').trim(),
    thumbnailUrl: String(data?.thumbnail_url || '').trim(),
  };
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
  const videoId = extractVideoId(url); // validates supported formats

  const defaultThumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  let meta = { title: '', thumbnailUrl: defaultThumb };
  try {
    const oembed = await fetchOEmbedMeta(videoId);
    meta = {
      title: oembed.title || '',
      thumbnailUrl: oembed.thumbnailUrl || defaultThumb,
    };
  } catch {
    // keep derived thumbnail/title empty
  }

  const attempts = [
    () => fetchSupadataTranscript(url, 'vi'),
    () => fetchSupadataTranscript(url, 'en'),
    () => fetchSupadataTranscript(url, null),
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result?.text && result.text.length > 100) {
        return { ...result, videoId, title: meta.title, thumbnailUrl: meta.thumbnailUrl };
      }
    } catch (e) {
      lastError = e;
    }
  }

  const err = new Error('Could not retrieve transcript for this video.');
  err.cause = lastError;
  throw err;
}
