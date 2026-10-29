#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const path = require('path');
const {performance} = require('perf_hooks');

const root = path.resolve(__dirname, '..', 'fixtures');
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';
const latencyMs = Number(process.env.LATENCY_MS || 12);
const bandwidthKbps = Number(process.env.BANDWIDTH_KBPS || 8192);

const delay = milliseconds =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

function sendJson(response, status, value) {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  });
  response.end(JSON.stringify(value, null, 2));
}

const server = http.createServer((request, response) => {
  const startedAt = performance.now();
  const requestedName = decodeURIComponent(
    new URL(request.url, `http://${request.headers.host}`).pathname.slice(1),
  );
  const filename = path.basename(requestedName);
  const filepath = path.join(root, filename);

  if (!filename || !fs.existsSync(filepath)) {
    sendJson(response, 404, {
      error: 'Not found',
      available: fs.existsSync(root)
        ? fs.readdirSync(root).filter(name => name.endsWith('.pdf'))
        : [],
    });
    return;
  }

  const {size} = fs.statSync(filepath);
  const range = request.headers.range;
  let start = 0;
  let end = size - 1;
  let status = 200;

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      response.writeHead(416, {'Content-Range': `bytes */${size}`});
      response.end();
      return;
    }
    start = match[1] ? Number(match[1]) : 0;
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      response.writeHead(416, {'Content-Range': `bytes */${size}`});
      response.end();
      return;
    }
    status = 206;
  }

  const headers = {
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Length': end - start + 1,
    'Content-Type': 'application/pdf',
  };
  if (status === 206) {
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }

  response.writeHead(status, headers);
  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  const stream = fs.createReadStream(filepath, {
    start,
    end,
    highWaterMark: 64 * 1024,
  });
  (async () => {
    await delay(latencyMs);
    for await (const chunk of stream) {
      if (!response.write(chunk)) {
        await new Promise(resolve => response.once('drain', resolve));
      }
      if (bandwidthKbps > 0) {
        await delay((chunk.length / (bandwidthKbps * 1024)) * 1000);
      }
    }
    response.end();
  })().catch(error => {
    console.error(`stream failed: ${error.message}`);
    response.destroy(error);
  });
  response.on('finish', () => {
    const elapsed = (performance.now() - startedAt).toFixed(1);
    console.log(
      `${request.method} ${status} ${filename} bytes=${start}-${end}/${size} ${elapsed}ms`,
    );
  });
});

server.listen(port, host, () => {
  console.log(`Range server: http://${host}:${port}`);
  console.log(`Serving: ${root}`);
  console.log(
    `Profile: ${latencyMs}ms/request, ${
      bandwidthKbps > 0 ? `${bandwidthKbps} KB/s` : 'unlimited bandwidth'
    }`,
  );
});
