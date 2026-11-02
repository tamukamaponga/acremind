<?php
function fail(string $message, int $status = 422): never
{
    throw new DomainException($message, $status);
}
require __DIR__ . '/../src/gemini.php';
$count = 0;
foreach (
    [
        [401, '{}'],
        [403, '{}'],
        [429, '{}'],
        [404, '{}'],
        [400, '{}'],
        [503, '{}'],
        [200, ''],
        [200, '{}'],
        [200, '{"promptFeedback":{"blockReason":"SAFETY"}}'],
        [200, '{"candidates":[{"finishReason":"SAFETY"}]}'],
        [0, false],
    ]
    as [$status, $body]
) {
    try {
        geminiAdvice($status, $body);
        throw new RuntimeException('Expected rejection');
    } catch (DomainException $e) {
        $count++;
    }
}
$body = json_encode([
    'candidates' => [
        [
            'content' => [
                'parts' => [
                    ['text' => 'private reasoning', 'thought' => true],
                    ['text' => 'Check soil records.'],
                ],
            ],
            'finishReason' => 'STOP',
        ],
    ],
]);
if (geminiAdvice(200, $body) !== 'Check soil records.') {
    throw new RuntimeException('Text extraction failed');
}
$count++;
echo "$count Gemini response checks passed.\n";
