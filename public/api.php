<?php
/**
 * MAIN JSON API
 * The browser selects an action using /api.php?action=... .
 * GET reads data; POST changes it. See docs/CODE_GUIDE.md for an action reference.
 */
require __DIR__ . '/../src/app.php';
require __DIR__ . '/../src/password-reset.php';
header('Content-Type: application/json; charset=utf-8');
function respond(mixed $data): never
{
    echo jsonValue($data);
    exit();
}
// 1. Read the request and reject changes without the correct session token.
try {
    $action = $_GET['action'] ?? 'state';
    $post = $_SERVER['REQUEST_METHOD'] === 'POST';
    $payload = $post
        ? json_decode(file_get_contents('php://input'), true, 64, JSON_THROW_ON_ERROR)
        : [];
    if (
        $post &&
        (!is_array($payload) ||
            !hash_equals($_SESSION['csrf'] ?? 'missing', $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))
    ) {
        fail('Session expired. Refresh the page.', 403);
    }
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
    // 2. Public session information and the initial owner/login flow.
    if ($action === 'session' && !$post) {
        respond([
            'user' => user(),
            'csrf' => $_SESSION['csrf'],
            'recovery_available' => recoveryConfigured(),
            'setup' => (int) sql('SELECT COUNT(*) FROM ffms_users')->fetchColumn() === 0,
        ]);
    }
    if ($post && $action === 'forgot-password') {
        respond(requestPasswordReset($payload));
    }
    if ($post && $action === 'reset-password') {
        respond(redeemPasswordReset($payload));
    }
    if (in_array($action, ['login', 'setup', 'register'], true) && $post) {
        $email = strtolower(trim((string) ($payload['email'] ?? '')));
        $password = $payload['password'] ?? '';
        if (
            !filter_var($email, FILTER_VALIDATE_EMAIL) ||
            strlen($email) > 190 ||
            !is_string($password) ||
            strlen($password) > 72 ||
            str_contains($password, "\0")
        ) {
            fail('Enter a valid email and password.');
        }
        $identity = hash('sha256', $email);
        $ip = hash('sha256', 'ip:' . ($_SERVER['REMOTE_ADDR'] ?? 'local'));
        sql('DELETE FROM ffms_attempts WHERE attempted_at<?', [time() - 900]);
        if (
            (int) sql('SELECT COUNT(*) FROM ffms_attempts WHERE identity IN (?,?)', [
                $identity,
                $ip,
            ])->fetchColumn() >= 10
        ) {
            fail('Too many attempts. Try again in 15 minutes.', 429);
        }
        if ($action === 'register') {
            sql('INSERT INTO ffms_attempts (identity,attempted_at) VALUES (?,?)', [$ip, time()]);
        }
        if (in_array($action, ['setup', 'register'], true)) {
            beginWrite(0);
            if (
                $action === 'setup' &&
                (int) sql('SELECT COUNT(*) FROM ffms_users')->fetchColumn() > 0
            ) {
                fail('Setup is complete. Ask your administrator for an account.', 403);
            }
            $name = trim((string) ($payload['name'] ?? ''));
            if ($name === '' || strlen($name) > 120 || strlen($password) < 12) {
                fail('Enter your name and a password of 12–72 bytes.');
            }
            sql(
                'INSERT INTO ffms_users (name,email,password_hash,role,created_at) VALUES (?,?,?,?,?)',
                [$name, $email, password_hash($password, PASSWORD_DEFAULT), 'Owner', now()],
            );
            commitWrite();
        }
        $u = sql('SELECT * FROM ffms_users WHERE email=?', [$email])->fetch();
        if (!$u || !$u['active'] || !password_verify($password, $u['password_hash'])) {
            sql('INSERT INTO ffms_attempts (identity,attempted_at) VALUES (?,?)', [
                $identity,
                time(),
            ]);
            sql('INSERT INTO ffms_attempts (identity,attempted_at) VALUES (?,?)', [$ip, time()]);
            fail('Email or password is incorrect.', 401);
        }
        session_regenerate_id(true);
        $_SESSION = [
            'uid' => (int) $u['id'],
            'sv' => (int) $u['session_version'],
            'seen' => time(),
            'csrf' => bin2hex(random_bytes(32)),
        ];
        $me = requireUser();
        audit($me, 'login', 'account', null);
        respond(['user' => $me, 'csrf' => $_SESSION['csrf']]);
    }
    // 3. Everything below requires a valid signed-in account.
    $u = requireUser();
    if ($action === 'logout' && $post) {
        $_SESSION = [];
        session_regenerate_id(true);
        respond(['ok' => true]);
    }
    // Password changes invalidate older sessions; passwords are stored only as hashes.
    if ($action === 'password' && $post) {
        $hash = sql('SELECT password_hash FROM ffms_users WHERE id=?', [$u['id']])->fetchColumn();
        $password = $payload['password'] ?? '';
        if (!password_verify((string) ($payload['current'] ?? ''), $hash)) {
            fail('Current password is incorrect.');
        }
        if (
            !is_string($password) ||
            strlen($password) < 12 ||
            strlen($password) > 72 ||
            str_contains($password, "\0")
        ) {
            fail('Use a password of 12–72 bytes.');
        }
        sql(
            'UPDATE ffms_users SET password_hash=?,must_change=0,session_version=session_version+1 WHERE id=?',
            [password_hash($password, PASSWORD_DEFAULT), $u['id']],
        );
        $_SESSION['sv']++;
        session_regenerate_id(true);
        audit($u, 'password changed', 'account', null);
        respond(['ok' => true]);
    }
    if ($u['must_change']) {
        fail('Change your temporary password before continuing.', 403);
    }
    // 4. Return only the modules and records this role is allowed to see.
    if ($action === 'state' && !$post) {
        $c = [];
        foreach (catalog() as $key => $m) {
            if (allowed($u, $key)) {
                $m['writable'] = allowed($u, $key, true);
                $c[$key] = $m;
            }
        }
        $rows = array_values(
            array_filter(records($u['tenant_id'], true), fn($r) => isset($c[$r['module']])),
        );
        respond([
            'user' => $u,
            'catalog' => $c,
            'records' => $rows,
            'settings' => settings($u['tenant_id']),
            'csrf' => $_SESSION['csrf'],
        ]);
    }
    // 5. Record changes are one transaction: validate, save, audit, then commit.
    if (in_array($action, ['save', 'archive', 'restore'], true) && $post) {
        beginWrite($u['tenant_id']);
        $id = saveRecord(
            $u,
            (string) ($payload['module'] ?? ''),
            $payload,
            $action === 'save' ? 'save' : $action,
        );
        commitWrite();
        respond(['ok' => true, 'id' => $id]);
    }
    // 6. Owner/administrator endpoints for history and staff access.
    if ($action === 'admin-overview' && !$post) {
        admin($u);
        respond([
            'records' => records($u['tenant_id'], true),
            'users' => sql(
                'SELECT id,name,email,role,active,must_change,created_at FROM ffms_users WHERE id=? OR tenant_id=? ORDER BY name',
                [$u['tenant_id'], $u['tenant_id']],
            )->fetchAll(),
            'activity' => sql(
                'SELECT actor,action,module,record_id,created_at FROM ffms_audit WHERE tenant_id=? ORDER BY id DESC LIMIT 100',
                [$u['tenant_id']],
            )->fetchAll(),
            'recovery_available' => recoveryConfigured(),
        ]);
    }
    if ($action === 'audit' && !$post) {
        admin($u);
        respond(
            sql(
                'SELECT actor,action,module,record_id,created_at FROM ffms_audit WHERE tenant_id=? ORDER BY id DESC LIMIT 500',
                [$u['tenant_id']],
            )->fetchAll(),
        );
    }
    if ($action === 'team' && !$post) {
        admin($u);
        respond(
            sql(
                'SELECT id,name,email,role,active,must_change FROM ffms_users WHERE id=? OR tenant_id=? ORDER BY name',
                [$u['tenant_id'], $u['tenant_id']],
            )->fetchAll(),
        );
    }
    if ($action === 'team' && $post) {
        admin($u);
        beginWrite($u['tenant_id']);
        $id = (int) ($payload['id'] ?? 0);
        $name = trim((string) ($payload['name'] ?? ''));
        $email = strtolower(trim((string) ($payload['email'] ?? '')));
        $role = $payload['role'] ?? '';
        if (
            $name === '' ||
            strlen($name) > 120 ||
            !filter_var($email, FILTER_VALIDATE_EMAIL) ||
            strlen($email) > 190 ||
            !in_array(
                $role,
                ['Administrator', 'Manager', 'Agronomist', 'Worker', 'Accountant'],
                true,
            )
        ) {
            fail('Enter valid staff details.');
        }
        if ($id) {
            $target = sql('SELECT * FROM ffms_users WHERE id=? AND tenant_id=?', [
                $id,
                $u['tenant_id'],
            ])->fetch();
            if (!$target || $target['role'] === 'Owner' || $id === $u['id']) {
                fail('This account cannot be changed here.', 403);
            }
            sql(
                'UPDATE ffms_users SET name=?,email=?,role=?,active=?,session_version=session_version+1 WHERE id=?',
                [$name, $email, $role, empty($payload['active']) ? 0 : 1, $id],
            );
        } else {
            $password = $payload['password'] ?? '';
            if (
                !is_string($password) ||
                strlen($password) < 12 ||
                strlen($password) > 72 ||
                str_contains($password, "\0")
            ) {
                fail('Set a temporary password of 12–72 bytes.');
            }
            sql(
                'INSERT INTO ffms_users (tenant_id,name,email,password_hash,role,must_change,created_at) VALUES (?,?,?,?,?,1,?)',
                [
                    $u['tenant_id'],
                    $name,
                    $email,
                    password_hash($password, PASSWORD_DEFAULT),
                    $role,
                    now(),
                ],
            );
            $id = (int) database()->lastInsertId();
        }
        if (!empty($payload['reset_password'])) {
            $password = $payload['reset_password'];
            if (
                !is_string($password) ||
                strlen($password) < 12 ||
                strlen($password) > 72 ||
                str_contains($password, "\0")
            ) {
                fail('Use a temporary password of 12–72 bytes.');
            }
            sql(
                'UPDATE ffms_users SET password_hash=?,must_change=1,session_version=session_version+1 WHERE id=?',
                [password_hash($password, PASSWORD_DEFAULT), $id],
            );
        }
        audit($u, 'staff changed', 'team', $id, null, ['name' => $name, 'role' => $role]);
        commitWrite();
        respond(['ok' => true]);
    }
    // 7. Business settings and a downloadable record backup.
    if ($action === 'settings' && $post) {
        admin($u);
        $d = [];
        foreach (['name', 'currency', 'address', 'phone'] as $key) {
            $d[$key] = trim((string) ($payload[$key] ?? ''));
            if (strlen($d[$key]) > 500) {
                fail('Settings value is too long.');
            }
        }
        if (!$d['name'] || !preg_match('/^[A-Z]{3}$/', $d['currency'])) {
            fail('Enter a business name and a three-letter currency code.');
        }
        beginWrite($u['tenant_id']);
        sql('DELETE FROM ffms_settings WHERE tenant_id=?', [$u['tenant_id']]);
        sql('INSERT INTO ffms_settings (tenant_id,data) VALUES (?,?)', [
            $u['tenant_id'],
            jsonValue($d),
        ]);
        audit($u, 'updated', 'settings', null, null, $d);
        commitWrite();
        respond(['ok' => true]);
    }
    if ($action === 'backup' && !$post) {
        admin($u);
        audit($u, 'export', 'backup', null);
        header(
            'Content-Disposition: attachment; filename="farm-records-' . date('Y-m-d') . '.json"',
        );
        respond([
            'format' => 'ffms-records-v1',
            'exported_at' => now(),
            'settings' => settings($u['tenant_id']),
            'records' => records($u['tenant_id'], true),
            'note' =>
                'Record backup. Accounts and password hashes are excluded. Use the server backup command for a complete database backup.',
        ]);
    }
    fail('Action not found.', 404);
    // 8. Roll back a failed change and send a safe error message; detailed errors stay in server logs.
} catch (DomainException $e) {
    rollbackWrite();
    http_response_code($e->getCode() ?: 422);
    respond(['error' => $e->getMessage()]);
} catch (JsonException $e) {
    rollbackWrite();
    http_response_code(400);
    respond(['error' => 'Invalid JSON request.']);
} catch (Throwable $e) {
    rollbackWrite();
    error_log((string) $e);
    http_response_code(500);
    respond([
        'error' =>
            $e instanceof PDOException && $e->getCode() === '23000'
                ? 'That email is already registered.'
                : 'The request could not be completed. Please try again.',
    ]);
}
