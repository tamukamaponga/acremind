/** Private SMTP bridge for the PHP-WASM runtime, which supports HTTP but not SMTP. */
import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
export async function startMailBridge(transport, sender, appUrl) {
  const secret = randomBytes(32).toString('hex');
  const server = http.createServer(async (req, res) => {
    const auth = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from('Bearer ' + secret);
    if (
      req.method !== 'POST' ||
      req.url !== '/reset' ||
      auth.length !== expected.length ||
      !timingSafeEqual(auth, expected)
    ) {
      res.writeHead(403).end();
      return;
    }
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 12000) throw Error('Payload too large');
      }
      const data = JSON.parse(body);
      const prefix = appUrl.replace(/\/$/, '') + '/#reset-password=';
      if (
        typeof data.to !== 'string' ||
        data.to.length > 190 ||
        !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(data.to) ||
        typeof data.reset_url !== 'string' ||
        !data.reset_url.startsWith(prefix) ||
        !/^[a-f0-9]{64}$/.test(data.reset_url.slice(prefix.length))
      )
        throw Error('Invalid reset message');
      // Build the message here: the bridge cannot send arbitrary subjects, HTML, or attachments.
      await transport.sendMail({
        from: sender,
        to: data.to,
        subject: 'Reset your AcreMind password',
        text:
          'Open this link to choose a new password:\n' +
          data.reset_url +
          '\n\nThis link expires in 30 minutes. If you did not request it, ignore this email.',
      });
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
    } catch {
      res.writeHead(502).end();
    }
  });
  server.requestTimeout = 20000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, url: 'http://127.0.0.1:' + server.address().port + '/reset', secret };
}
