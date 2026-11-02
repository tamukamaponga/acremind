<?php
/** Email recovery: only token digests are stored. Links expire after 30 minutes and work once. */
function recoveryConfigured(): bool
{
    $url = getenv('PASSWORD_RESET_WEBHOOK_URL') ?: '';
    $base = getenv('APP_URL') ?: '';
    $bridge = getenv('FFMS_MAIL_BRIDGE_URL') ?: '';
    $local =
        parse_url($bridge, PHP_URL_SCHEME) === 'http' &&
        parse_url($bridge, PHP_URL_HOST) === '127.0.0.1' &&
        strlen(getenv('FFMS_MAIL_BRIDGE_TOKEN') ?: '') === 64;
    return ($local || parse_url($url, PHP_URL_SCHEME) === 'https') &&
        (parse_url($base, PHP_URL_SCHEME) === 'https' ||
            (parse_url($base, PHP_URL_SCHEME) === 'http' &&
                in_array(parse_url($base, PHP_URL_HOST), ['localhost', '127.0.0.1'], true)));
}
function recoveryThrottle(string $identity): void
{
    $keys = [
        hash('sha256', 'recovery:' . $identity),
        hash('sha256', 'recovery-ip:' . ($_SERVER['REMOTE_ADDR'] ?? 'local')),
    ];
    beginWrite(0);
    sql('DELETE FROM ffms_attempts WHERE attempted_at<?', [time() - 900]);
    foreach ($keys as $key) {
        if (
            (int) sql('SELECT COUNT(*) FROM ffms_attempts WHERE identity=?', [
                $key,
            ])->fetchColumn() >= 8
        ) {
            fail('Too many recovery attempts. Try again in 15 minutes.', 429);
        }
        sql('INSERT INTO ffms_attempts (identity,attempted_at) VALUES (?,?)', [$key, time()]);
    }
    commitWrite();
}
function requestPasswordReset(array $payload): array
{
    $email = strtolower(trim((string) ($payload['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
        fail('Enter a valid email address.');
    }
    if (!recoveryConfigured()) {
        fail('Password recovery email is not connected yet. Contact your administrator.', 503);
    }
    recoveryThrottle($email);
    $reply = [
        'message' =>
            'If an active account uses that email, a password reset link will be sent. Check your inbox and spam folder. The link expires in 30 minutes.',
    ];
    $u = sql('SELECT id,email,password_hash FROM ffms_users WHERE email=? AND active=1', [
        $email,
    ])->fetch();
    if (!$u) {
        return $reply;
    }
    $token = bin2hex(random_bytes(32));
    $digest = hash('sha256', $token);
    sql('DELETE FROM ffms_password_resets WHERE expires_at<?', [time()]);
    sql(
        'INSERT INTO ffms_password_resets (token_hash,user_id,password_fingerprint,expires_at) VALUES (?,?,?,?)',
        [$digest, $u['id'], hash('sha256', $u['password_hash']), time() + 1800],
    );
    // A fragment keeps the token out of ordinary server request/access logs.
    $link = rtrim(getenv('APP_URL'), '/') . '/#reset-password=' . $token;
    $headers = ['Content-Type: application/json'];
    $deliveryUrl = getenv('FFMS_MAIL_BRIDGE_URL') ?: getenv('PASSWORD_RESET_WEBHOOK_URL');
    $deliveryToken = getenv('FFMS_MAIL_BRIDGE_URL')
        ? getenv('FFMS_MAIL_BRIDGE_TOKEN')
        : getenv('PASSWORD_RESET_WEBHOOK_TOKEN');
    if ($deliveryToken) {
        $headers[] = 'Authorization: Bearer ' . $deliveryToken;
    }
    $ch = curl_init($deliveryUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => jsonValue([
            'event' => 'account.password_reset',
            'to' => $u['email'],
            'subject' => 'Reset your AcreMind password',
            'text' => "Open this link to choose a new password: $link\nThis link expires in 30 minutes. If you did not request it, you can ignore this email.",
            'reset_url' => $link,
            'expires_in_seconds' => 1800,
        ]),
    ]);
    $result = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($result === false || $status < 200 || $status >= 300) {
        sql('DELETE FROM ffms_password_resets WHERE token_hash=?', [$digest]);
        // Do not expose account existence or log the email, token, or provider response.
        error_log('Password reset email delivery failed. Check the configured delivery service.');
    }
    return $reply;
}
function redeemPasswordReset(array $payload): array
{
    $token = $payload['token'] ?? '';
    $password = $payload['password'] ?? '';
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) {
        fail('This reset link is invalid or expired. Request a new link.');
    }
    if (
        !is_string($password) ||
        strlen($password) < 12 ||
        strlen($password) > 72 ||
        str_contains($password, "\0")
    ) {
        fail('Use a password of 12–72 bytes.');
    }
    recoveryThrottle('redeem:' . hash('sha256', $token));
    beginWrite(0);
    $r = sql(
        'SELECT r.*,u.password_hash,u.active FROM ffms_password_resets r JOIN ffms_users u ON u.id=r.user_id WHERE token_hash=?',
        [hash('sha256', $token)],
    )->fetch();
    if (
        !$r ||
        !$r['active'] ||
        (int) $r['expires_at'] <= time() ||
        !hash_equals($r['password_fingerprint'], hash('sha256', $r['password_hash']))
    ) {
        fail('This reset link is invalid or expired. Request a new link.');
    }
    // Deleting the token in the same transaction makes simultaneous submissions safe.
    $deleted = sql('DELETE FROM ffms_password_resets WHERE token_hash=?', [hash('sha256', $token)]);
    if ($deleted->rowCount() !== 1) {
        fail('This reset link has already been used.');
    }
    $changed = sql(
        'UPDATE ffms_users SET password_hash=?,must_change=0,session_version=session_version+1 WHERE id=? AND password_hash=? AND active=1',
        [password_hash($password, PASSWORD_DEFAULT), $r['user_id'], $r['password_hash']],
    );
    if ($changed->rowCount() !== 1) {
        fail('This reset link is invalid or expired. Request a new link.');
    }
    sql('DELETE FROM ffms_password_resets WHERE user_id=?', [$r['user_id']]);
    $account = sql('SELECT id,tenant_id,name FROM ffms_users WHERE id=?', [$r['user_id']])->fetch();
    $account['tenant_id'] = (int) ($account['tenant_id'] ?: $account['id']);
    audit($account, 'password recovered', 'account', null);
    commitWrite();
    $_SESSION = ['csrf' => bin2hex(random_bytes(32))];
    session_regenerate_id(true);
    return [
        'ok' => true,
        'csrf' => $_SESSION['csrf'],
        'message' => 'Password updated. Sign in with your new password.',
    ];
}
