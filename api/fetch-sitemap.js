const https = require('https');
const http = require('http');
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
    /^169\.254\./,      // link-local
    /^::1$/,
    /^fc00:/i,
    /^fe80:/i,
    /^metadata\.google/i,
  ];
  return privatePatterns.some(p => p.test(hostname));
}

function fetchURL(url, maxRedirects = 3) {
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
        'Accept': 'application/xml, text/xml, */*'
      }
    }, (res) => {
      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        return fetchURL(res.headers.location, maxRedirects - 1).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      // Size limit: 50MB
      const contentLength = parseInt(res.headers['content-length'] || '0', 10);
      if (contentLength > 50 * 1024 * 1024) {
        return reject(new Error('File too large (max 50MB)'));
      }

      const chunks = [];
      let totalSize = 0;

      res.on('data', (chunk) => {
        totalSize += chunk.length;
        if (totalSize > 50 * 1024 * 1024) {
          req.destroy();
          return reject(new Error('File too large (max 50MB)'));
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf-8'));
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
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid URL format' });
  }

  try {
    const data = await fetchURL(url);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
