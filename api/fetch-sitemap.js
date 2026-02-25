const https = require('https');
const http = require('http');
const zlib = require('zlib');
const { URL } = require('url');

// SSRF protection: block private/internal IPs
function isPrivateIP(hostname) {
  const privatePatterns = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^0\./,
    /^169\.254\./,
    /^::1$/,
    /^fc00:/i,
    /^fe80:/i,
    /^metadata\.google/i,
  ];
  return privatePatterns.some(p => p.test(hostname));
}

function fetchURL(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) {
      return reject(new Error('Too many redirects'));
    }

    let parsedURL;
    try {
      parsedURL = new URL(url);
    } catch {
      return reject(new Error('Invalid URL'));
    }

    if (!['http:', 'https:'].includes(parsedURL.protocol)) {
      return reject(new Error('Only HTTP/HTTPS URLs are supported'));
    }

    if (isPrivateIP(parsedURL.hostname)) {
      return reject(new Error('Access to private/internal addresses is blocked'));
    }

    const client = parsedURL.protocol === 'https:' ? https : http;

    const req = client.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'SitemapToolsSuite/1.0',
        'Accept': 'application/xml, text/xml, */*',
        'Accept-Encoding': 'gzip, deflate'
      }
    }, (res) => {
      // Handle redirects — resolve relative URLs against the request URL
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        let redirectUrl;
        try {
          redirectUrl = new URL(res.headers.location, url).href;
        } catch {
          return reject(new Error('Invalid redirect URL'));
        }
        return fetchURL(redirectUrl, maxRedirects - 1).then(resolve).catch(reject);
      }

      if (res.statusCode === 404) {
        return reject(new Error('Sitemap not found (404). Check the URL path.'));
      }

      if (res.statusCode === 403) {
        return reject(new Error('Access denied (403). The server blocked the request.'));
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      // Size limit: 50MB
      const contentLength = parseInt(res.headers['content-length'] || '0', 10);
      if (contentLength > 50 * 1024 * 1024) {
        return reject(new Error('File too large (max 50MB)'));
      }

      // Decompress if gzipped or deflated
      let stream = res;
      const encoding = (res.headers['content-encoding'] || '').toLowerCase();
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      } else if (encoding === 'br') {
        stream = res.pipe(zlib.createBrotliDecompress());
      }

      const chunks = [];
      let totalSize = 0;

      stream.on('data', (chunk) => {
        totalSize += chunk.length;
        if (totalSize > 50 * 1024 * 1024) {
          req.destroy();
          return reject(new Error('File too large (max 50MB)'));
        }
        chunks.push(chunk);
      });

      stream.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');

        // Validate: check if response looks like XML
        const trimmed = body.trimStart();
        if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<HTML')) {
          return reject(new Error(
            'The URL returned an HTML page instead of XML. ' +
            'Make sure the URL points to a sitemap.xml file.'
          ));
        }

        if (!trimmed.startsWith('<?xml') && !trimmed.startsWith('<urlset') && !trimmed.startsWith('<sitemapindex')) {
          // Could still be valid XML without declaration, but warn if it looks wrong
          if (trimmed.length === 0) {
            return reject(new Error('The URL returned an empty response.'));
          }
          if (!trimmed.startsWith('<')) {
            return reject(new Error(
              'The URL did not return valid XML. The response may be plain text, JSON, or another format.'
            ));
          }
        }

        resolve(body);
      });

      stream.on('error', (err) => {
        reject(new Error(`Decompression error: ${err.message}`));
      });
    });

    req.on('error', (err) => reject(new Error(`Fetch error: ${err.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { url } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, error: 'URL is required' });
  }

  // Validate URL
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid URL format' });
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return res.status(400).json({ success: false, error: 'Only HTTP/HTTPS URLs are supported' });
  }

  try {
    const data = await fetchURL(url);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
