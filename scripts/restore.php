<?php
/** Maintenance command: verify and restore a full backup into an empty storage directory. Never overwrite live data. */
if (PHP_SAPI !== 'cli') {
    exit(1);
}
$source = getenv('FFMS_RESTORE_FILE') ?: '';
$target = getenv('FFMS_STORAGE') ?: __DIR__ . '/../storage';
if (!is_file($source)) {
    fwrite(STDERR, "Set FFMS_RESTORE_FILE to a complete SQLite backup.\n");
    exit(1);
}
if (file_exists($target . '/ffms.sqlite')) {
    fwrite(
        STDERR,
        "Refusing to overwrite an existing database. Stop the server and choose an empty FFMS_STORAGE directory.\n",
    );
    exit(1);
}
try {
    $db = new PDO('sqlite:' . $source, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    if ($db->query('PRAGMA integrity_check')->fetchColumn() !== 'ok') {
        throw new RuntimeException('Backup integrity check failed.');
    }
    foreach (
        ['ffms_users', 'ffms_records', 'ffms_audit', 'ffms_settings', 'ffms_attempts']
        as $table
    ) {
        $db->query('SELECT 1 FROM ' . $table . ' LIMIT 1');
    }
    $db = null;
    if (!is_dir($target)) {
        mkdir($target, 0700, true);
    }
    $temporary = $target . '/restore-' . bin2hex(random_bytes(4)) . '.sqlite';
    if (!copy($source, $temporary)) {
        throw new RuntimeException('Copy failed.');
    }
    chmod($temporary, 0600);
    if (!rename($temporary, $target . '/ffms.sqlite')) {
        throw new RuntimeException('Restore failed.');
    }
    echo "Database restored to $target. Start the server with the same FFMS_STORAGE setting.\n";
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}
