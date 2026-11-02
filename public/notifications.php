<?php
/** Optional delivery endpoint. Builds an alert summary and submits it only to the configured HTTPS service. */
require __DIR__ . '/../src/app.php';
header('Content-Type: application/json; charset=utf-8');
try {
    $u = requireUser();
    admin($u);
    if ($u['must_change']) {
        fail('Change your temporary password first.', 403);
    }
    $url = getenv('NOTIFICATION_WEBHOOK_URL') ?: '';
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        echo jsonValue([
            'configured' => (bool) $url,
            'alerts' => notificationSummary($u['tenant_id']),
        ]);
        exit();
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        fail('Method not allowed.', 405);
    }
    if (!hash_equals($_SESSION['csrf'] ?? 'missing', $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) {
        fail('Refresh the page and try again.', 403);
    }
    if (!$url) {
        fail(
            'Email/SMS delivery is not configured. Set the notification webhook on the server.',
            503,
        );
    }
    if (parse_url($url, PHP_URL_SCHEME) !== 'https') {
        fail('The notification webhook must use HTTPS.', 503);
    }
    if (time() - ($_SESSION['notify_at'] ?? 0) < 60) {
        fail('Wait one minute before sending another summary.', 429);
    }
    $messages = notificationSummary($u['tenant_id']);
    if (!$messages) {
        fail('There are no current alerts to send.');
    }
    $_SESSION['notify_at'] = time();
    $headers = ['Content-Type: application/json'];
    if (getenv('NOTIFICATION_WEBHOOK_TOKEN')) {
        $headers[] = 'Authorization: Bearer ' . getenv('NOTIFICATION_WEBHOOK_TOKEN');
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => jsonValue([
            'event' => 'farm.alert_summary',
            'business' => settings($u['tenant_id'])['name'],
            'created_at' => now(),
            'alerts' => array_slice($messages, 0, 100),
        ]),
    ]);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($body === false || $status < 200 || $status >= 300) {
        fail(
            'The notification service did not accept the summary. Check the server connection.',
            502,
        );
    }
    audit($u, 'submitted alert summary', 'notifications', null, null, [
        'count' => count($messages),
    ]);
    echo jsonValue([
        'ok' => true,
        'message' =>
            'The delivery service accepted the summary. Check that service for email/SMS delivery status.',
    ]);
} catch (DomainException $e) {
    http_response_code($e->getCode() ?: 422);
    echo jsonValue(['error' => $e->getMessage()]);
} catch (Throwable $e) {
    error_log((string) $e);
    http_response_code(500);
    echo jsonValue(['error' => 'Notification request failed.']);
}
