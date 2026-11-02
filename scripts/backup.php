<?php
/** Maintenance command: make a consistent full SQLite backup, including accounts and audit history. */
if (PHP_SAPI !== 'cli') {
    exit(1);
}
require __DIR__ . '/../src/app.php';
$pdo = database();
if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) !== 'sqlite') {
    fwrite(STDERR, "Use your database server's consistent backup tool for MySQL.\n");
    exit(1);
}
$directory = $store . '/backups';
if (!is_dir($directory)) {
    mkdir($directory, 0700, true);
}
$file = $directory . '/ffms-' . date('Y-m-d-His') . '-' . bin2hex(random_bytes(3)) . '.sqlite';
$pdo->exec('VACUUM INTO ' . $pdo->quote($file));
chmod($file, 0600);
echo "Complete database backup saved: $file\n";
