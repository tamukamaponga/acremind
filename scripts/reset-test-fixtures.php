<?php
/** Creates recovery tokens only in explicitly selected test storage. Never prints real credentials. */
if (PHP_SAPI !== 'cli' || !str_contains(getenv('FFMS_STORAGE') ?: '', 'test-')) {
    exit(1);
}
require __DIR__ . '/../src/app.php';
$u = sql('SELECT id,password_hash FROM ffms_users WHERE email=?', [
    'reset-owner@example.test',
])->fetch();
if (!$u) {
    exit(1);
}
foreach (['a' => time() + 1800, 'b' => time() - 1, 'c' => time() + 1800] as $letter => $expiry) {
    sql('DELETE FROM ffms_password_resets WHERE token_hash=?', [
        hash('sha256', str_repeat($letter, 64)),
    ]);
    sql(
        'INSERT INTO ffms_password_resets (token_hash,user_id,password_fingerprint,expires_at) VALUES (?,?,?,?)',
        [
            hash('sha256', str_repeat($letter, 64)),
            $u['id'],
            hash('sha256', $u['password_hash']),
            $expiry,
        ],
    );
}
echo "Test-only reset fixtures ready.\n";
