#!/usr/bin/env node
// ==============================================================================
// NETRAVAHA — Local Forensic Evidence Vault (S3-Compatible Gateway)
// Gujarat Police Innovation Challenge 2026
// Provides high-reliability S3 storage for MinIO SDK & @aws-sdk/client-s3
// ==============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.MINIO_PORT || '9000', 10);
const STORAGE_ROOT = path.resolve(__dirname, '../fixtures/evidence-vault');

if (!fs.existsSync(STORAGE_ROOT)) {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

function getFilePath(bucket, objectKey) {
  return path.join(STORAGE_ROOT, bucket, objectKey);
}

function getMetaPath(bucket, objectKey) {
  return path.join(STORAGE_ROOT, bucket, `${objectKey}.meta.json`);
}

const server = http.createServer((req, res) => {
  const urlParts = req.url.split('?');
  const pathname = decodeURIComponent(urlParts[0]);

  // Health checks
  if (pathname === '/minio/health/live' || pathname === '/minio/health/ready') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  // Parse bucket and key
  // Path format: /<bucket> or /<bucket>/<key...>
  const segments = pathname.replace(/^\/+/, '').split('/');
  const bucket = segments[0];
  const objectKey = segments.slice(1).join('/');

  if (!bucket) {
    res.writeHead(200, { 'Content-Type': 'application/xml' });
    res.end('<?xml version="1.0" encoding="UTF-8"?><ListAllMyBucketsResult><Buckets><Bucket><Name>police-evidence-vault</Name></Bucket></Buckets></ListAllMyBucketsResult>');
    return;
  }

  // Bucket existence / creation
  if (!objectKey) {
    const bucketDir = path.join(STORAGE_ROOT, bucket);
    if (req.method === 'HEAD' || req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      res.end('<?xml version="1.0" encoding="UTF-8"?><Ok/>');
      return;
    }
    if (req.method === 'PUT') {
      if (!fs.existsSync(bucketDir)) {
        fs.mkdirSync(bucketDir, { recursive: true });
      }
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      res.end('<?xml version="1.0" encoding="UTF-8"?><CreateBucketResult/>');
      return;
    }
  }

  const filePath = getFilePath(bucket, objectKey);
  const metaPath = getMetaPath(bucket, objectKey);

  // PUT Object
  if (req.method === 'PUT') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      const md5 = crypto.createHash('md5').update(buffer).digest('hex');

      // Extract custom metadata headers
      const metadata = {};
      for (const [header, val] of Object.entries(req.headers)) {
        if (header.startsWith('x-amz-meta-')) {
          metadata[header] = val;
        }
      }

      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, buffer);
      fs.writeFileSync(metaPath, JSON.stringify({
        size: buffer.length,
        sha256,
        md5,
        contentType: req.headers['content-type'] || 'image/jpeg',
        metadata,
        createdAt: new Date().toISOString(),
      }, null, 2));

      res.writeHead(200, {
        'ETag': `"${md5}"`,
        'x-amz-version-id': 'null',
        'Content-Type': 'application/xml',
      });
      res.end();
    });
    return;
  }

  // GET Object
  if (req.method === 'GET') {
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'application/xml' });
      res.end('<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>');
      return;
    }

    const buffer = fs.readFileSync(filePath);
    let meta = {};
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch (e) {}
    }

    const headers = {
      'Content-Type': meta.contentType || 'image/jpeg',
      'Content-Length': buffer.length.toString(),
      'ETag': `"${meta.md5 || crypto.createHash('md5').update(buffer).digest('hex')}"`,
      'Last-Modified': fs.statSync(filePath).mtime.toUTCString(),
    };

    if (meta.metadata) {
      for (const [k, v] of Object.entries(meta.metadata)) {
        headers[k] = v;
      }
    }

    res.writeHead(200, headers);
    res.end(buffer);
    return;
  }

  // HEAD Object
  if (req.method === 'HEAD') {
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'application/xml' });
      res.end();
      return;
    }

    const stat = fs.statSync(filePath);
    let meta = {};
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch (e) {}
    }

    const headers = {
      'Content-Type': meta.contentType || 'image/jpeg',
      'Content-Length': stat.size.toString(),
      'ETag': `"${meta.md5 || ''}"`,
      'Last-Modified': stat.mtime.toUTCString(),
    };

    if (meta.metadata) {
      for (const [k, v] of Object.entries(meta.metadata)) {
        headers[k] = v;
      }
    }

    res.writeHead(200, headers);
    res.end();
    return;
  }

  // DELETE Object
  if (req.method === 'DELETE') {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(405);
  res.end();
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🏛️ NETRAVAHA Forensic Evidence Vault (S3 compatible) listening on port ${PORT}`);
    console.log(`📁 Local storage root: ${STORAGE_ROOT}`);
  });
}

module.exports = { server, STORAGE_ROOT };
