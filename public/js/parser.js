/**
 * Sitemap Parser — Parses XML sitemaps and sitemap index files
 */
const SitemapParser = {
  /**
   * Parse XML string into sitemap entries
   */
  parse(xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');

    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      throw new Error('Invalid XML format: ' + parseError.textContent.substring(0, 100));
    }

    // Check if it's a sitemap index
    const sitemapIndex = doc.querySelectorAll('sitemapindex > sitemap');
    if (sitemapIndex.length > 0) {
      return {
        type: 'index',
        sitemaps: Array.from(sitemapIndex).map(s => {
          const loc = s.querySelector('loc');
          const lastmod = s.querySelector('lastmod');
          return {
            loc: loc ? loc.textContent.trim() : '',
            lastmod: lastmod ? lastmod.textContent.trim() : ''
          };
        })
      };
    }

    // Parse regular sitemap
    const urls = doc.querySelectorAll('urlset > url');
    if (urls.length === 0) {
      // Try without namespace
      const allUrls = doc.getElementsByTagName('url');
      if (allUrls.length === 0) {
        throw new Error('No URLs found in sitemap');
      }
      return {
        type: 'sitemap',
        entries: Array.from(allUrls).map(u => this._parseUrlEntry(u))
      };
    }

    return {
      type: 'sitemap',
      entries: Array.from(urls).map(u => this._parseUrlEntry(u))
    };
  },

  _parseUrlEntry(urlNode) {
    const getText = (tagName) => {
      // Try direct child first
      const el = urlNode.querySelector(tagName) ||
                 urlNode.getElementsByTagName(tagName)[0];
      return el ? el.textContent.trim() : '';
    };

    return {
      loc: getText('loc'),
      lastmod: getText('lastmod'),
      changefreq: getText('changefreq'),
      priority: getText('priority')
    };
  },

  /**
   * Parse CSV text into sitemap entries
   */
  parseCSV(csvText) {
    const lines = csvText.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) {
      throw new Error('CSV must have a header row and at least one data row');
    }

    const header = lines[0].toLowerCase();
    const hasHeader = header.includes('url') || header.includes('loc');
    const startIdx = hasHeader ? 1 : 0;

    const entries = [];
    const errors = [];

    for (let i = startIdx; i < lines.length; i++) {
      const cols = this._parseCSVLine(lines[i]);
      if (cols.length === 0) continue;

      const url = cols[0] ? cols[0].trim() : '';
      if (!url) continue;

      if (!this._isValidURL(url)) {
        errors.push(`Row ${i + 1}: Invalid URL — ${url}`);
        continue;
      }

      entries.push({
        loc: url,
        lastmod: cols[1] ? cols[1].trim() : '',
        changefreq: cols[2] ? cols[2].trim() : '',
        priority: cols[3] ? cols[3].trim() : ''
      });
    }

    return { entries, errors };
  },

  _parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  },

  _isValidURL(str) {
    try {
      const url = new URL(str);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }
};
