<?php
/** Maintenance command: reset a selected account using process environment variables, then require a new password. */
if (PHP_SAPI !== 'cli') {
    exit(1);
}
require __DIR__ . '/../src/app.php';
$email = strtolower(trim(getenv('FFMS_RECOVERY_EMAIL') ?: ''));
$password = getenv('FFMS_RECOVERY_PASSWORD') ?: '';
if (
    !filter_var($email, FILTER_VALIDATE_EMAIL) ||
    strlen($password) < 12 ||
    strlen($password) > 72 ||
    str_contains($password, "\0")
) {
    fwrite(
        STDERR,
        "Set FFMS_RECOVERY_EMAIL and FFMS_RECOVERY_PASSWORD (12–72 bytes) in the process environment.\n",
    );
    exit(1);
}
$u = sql('SELECT * FROM ffms_users WHERE email=?', [$email])->fetch();
if (!$u) {
    fwrite(STDERR, "Account not found.\n");
    exit(1);
}
sql(
    'UPDATE ffms_users SET password_hash=?,active=1,must_change=1,session_version=session_version+1 WHERE id=?',
    [password_hash($password, PASSWORD_DEFAULT), $u['id']],
);
$u['tenant_id'] = $u['tenant_id'] ?: $u['id'];
audit($u, 'local recovery', 'account', (int) $u['id']);
echo "Password reset. The account must set a new password when signing in.\n";
