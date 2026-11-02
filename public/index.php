<?php
/** HTML entry page. Loads the stylesheet and browser script; business data comes from api.php. */
header(
    "Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://api.open-meteo.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
);
header('X-Content-Type-Options: nosniff');
?><!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#103e34"><title>AcreMind · Farm management</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/style.css"><script src="/app.js" defer></script></head><body><div id="app"><div class="loading">Opening your farm workspace…</div></div><div id="toast" role="status" aria-live="polite"></div><dialog id="editor" aria-labelledby="dialog-title"></dialog><noscript>This application needs JavaScript enabled.</noscript></body></html>
