/** Normalize copy/paste wrappers without logging or changing the key itself. */
export function normalizeGeminiKey(input) {
  let key = String(input)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
  key = key.replace(/^(?:export\s+)?(?:GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*/, '');
  if (
    [
      ['"', '"'],
      ["'", "'"],
      ['“', '”'],
      ['‘', '’'],
      ['`', '`'],
    ].some(([a, b]) => key.startsWith(a) && key.endsWith(b))
  )
    key = key.slice(1, -1).trim();
  if (!key)
    throw Error(
      'No key was received. Copy the full secret key, paste it at the hidden prompt, then press Return.',
    );
  if (key.startsWith('sk-'))
    throw Error(
      'That looks like an OpenAI key. Copy your Gemini key from Google AI Studio instead.',
    );
  if (key.startsWith('gen-lang-client-') || /^https?:\/\//i.test(key))
    throw Error(
      'That is a project ID or link. Copy the secret API key itself from Google AI Studio.',
    );
  if (key.includes('…') || key.includes('...'))
    throw Error(
      'That appears to be a shortened key. Use the full key copied from Google AI Studio.',
    );
  if (key.length < 20)
    throw Error(
      'Only ' +
        key.length +
        ' characters were received. Copy the full secret key, not its display name.',
    );
  if (key.length > 4096) throw Error('Too much text was pasted. Copy only the secret key.');
  if (/\s/.test(key))
    throw Error(
      'The pasted text contains spaces or line breaks inside it. Copy only the key using the key copy control.',
    );
  if (/[^\x21-\x7E]/.test(key))
    throw Error(
      'The pasted text contains nonstandard or invisible characters. Copy the key directly from Google AI Studio.',
    );
  return key;
}
