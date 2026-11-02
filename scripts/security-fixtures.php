<?php
if (PHP_SAPI !== 'cli' || !str_contains(getenv('FFMS_STORAGE') ?: '', 'test-')) {
    exit(1);
}
require __DIR__ . '/../src/app.php';
if (!sql('SELECT id FROM ffms_users WHERE email=?', ['other-owner@example.test'])->fetchColumn()) {
    sql('INSERT INTO ffms_users (name,email,password_hash,role,created_at) VALUES (?,?,?,?,?)', [
        'Other owner',
        'other-owner@example.test',
        password_hash('Other-owner-test-2026', PASSWORD_DEFAULT),
        'Owner',
        now(),
    ]);
}
echo "Isolated second-workspace test fixture ready.\n";
