<?php
/** Convert Gemini responses to safe application messages; never expose provider payloads or keys. */
function geminiAdvice(int $status, string|false $body): string
{
    if ($body === false) {
        fail(
            'Could not reach Google Gemini. Check the server internet connection and try again.',
            502,
        );
    }
    $data = json_decode($body, true);
    if ($status === 401 || $status === 403) {
        fail(
            'Gemini rejected the key or project access. Check your Google AI Studio key and API permissions.',
            502,
        );
    }
    if ($status === 429) {
        fail(
            'Gemini quota or rate limit reached. Check Google AI Studio usage and billing, or retry later.',
            502,
        );
    }
    if ($status === 404) {
        fail(
            'The configured Gemini model is unavailable. Check GEMINI_MODEL and project access.',
            502,
        );
    }
    if ($status === 400) {
        fail('Gemini rejected the request. Check your API key, model and project settings.', 502);
    }
    if ($status < 200 || $status >= 300) {
        fail('Google Gemini is temporarily unavailable. Try again later.', 502);
    }
    if (!is_array($data)) {
        fail('Gemini returned an empty or invalid response. Try again.', 502);
    }
    if (!empty($data['promptFeedback']['blockReason'])) {
        fail(
            'Gemini could not answer this question. Rephrase it as a farm planning or recordkeeping question.',
            422,
        );
    }
    $candidate = $data['candidates'][0] ?? [];
    if (
        in_array(
            $candidate['finishReason'] ?? '',
            ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT'],
            true,
        )
    ) {
        fail('Gemini could not provide this advice. Try a different planning question.', 422);
    }
    $text = '';
    foreach ($candidate['content']['parts'] ?? [] as $part) {
        if (empty($part['thought']) && is_string($part['text'] ?? null)) {
            $text .= $part['text'] . "\n";
        }
    }
    if (!trim($text)) {
        fail('Gemini returned no advice. Try a shorter question.', 502);
    }
    if (($candidate['finishReason'] ?? '') === 'MAX_TOKENS') {
        $text .= "\n[Response shortened. Ask a narrower question for more detail.]";
    }
    return trim($text);
}
