import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/**
 * Dev-only diagnostics bridge. Lets a shell script ask the running frontend (browser or the Tauri
 * webview in `tauri dev`) for a PNG of the habitat canvas plus a JSON state dump, without any
 * screen-recording permission:
 *
 *   curl 'http://localhost:1420/__webpets/snap?name=boot'   -> frontend answers by POSTing to /__webpets/diag
 *   ls .diag/                                               -> boot.png + boot.json
 *
 * Never part of a production build: Vite only calls configureServer for the dev server.
 */
export function webpetsDiag(): Plugin {
  return {
    name: 'webpets-diag',
    apply: 'serve',
    configureServer(server) {
      const dir = resolve(server.config.root, '.diag');
      mkdirSync(dir, { recursive: true });
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (url.pathname === '/__webpets/snap') {
          const name = (url.searchParams.get('name') ?? 'snap').replace(/[^a-z0-9_-]/gi, '_');
          server.ws.send({ type: 'custom', event: 'webpets:snap', data: { name } });
          res.statusCode = 202;
          res.end(`requested ${name}\n`);
          return;
        }
        if (url.pathname === '/__webpets/list') {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(readdirSync(dir)));
          return;
        }
        if (url.pathname === '/__webpets/diag' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => {
            body += chunk.toString('utf8');
          });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body) as { name?: string; png?: string; state?: unknown };
              mkdirSync(dir, { recursive: true }); // the folder may have been cleaned since the server started
              const name = (payload.name ?? 'snap').replace(/[^a-z0-9_-]/gi, '_');
              if (typeof payload.png === 'string') {
                const b64 = payload.png.replace(/^data:image\/png;base64,/, '');
                writeFileSync(resolve(dir, `${name}.png`), Buffer.from(b64, 'base64'));
              }
              writeFileSync(resolve(dir, `${name}.json`), JSON.stringify(payload.state ?? null, null, 2));
              res.statusCode = 204;
              res.end();
            } catch (e) {
              res.statusCode = 400;
              res.end(String(e));
            }
          });
          return;
        }
        next();
      });
    },
  };
}
