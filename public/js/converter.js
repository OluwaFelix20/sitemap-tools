/**
 * Converter — Export sitemap data to CSV, JSON, Excel, XML
 */
const Converter = {
  /**
   * Sanitize cell value to prevent CSV injection
   */
  _sanitize(val) {
    if (!val) return '';
    const s = String(val);
    if (/^[=+\-@\t\r]/.test(s)) {
      return "'" + s;
    }
    return s;
  },

  /**
   * Export to CSV string
   */
  toCSV(entries) {
    const headers = ['URL', 'Last Modified', 'Change Frequency', 'Priority'];
    const rows = entries.map(e => [
      this._sanitize(e.loc),
      this._sanitize(e.lastmod),
      this._sanitize(e.changefreq),
      this._sanitize(e.priority)
    ]);

    const escape = (val) => {
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    const lines = [headers.map(escape).join(',')];
    rows.forEach(row => lines.push(row.map(escape).join(',')));
    return lines.join('\n');
  },

  /**
   * Export to JSON string
   */
  toJSON(entries) {
    return JSON.stringify(entries.map(e => ({
      url: e.loc,
      lastModified: e.lastmod || null,
      changeFrequency: e.changefreq || null,
      priority: e.priority ? parseFloat(e.priority) : null
    })), null, 2);
  },

  /**
   * Export to XML sitemap string
   */
  toXML(entries) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    entries.forEach(e => {
      xml += '  <url>\n';
      xml += `    <loc>${this._escapeXml(e.loc)}</loc>\n`;
      if (e.lastmod) xml += `    <lastmod>${this._escapeXml(e.lastmod)}</lastmod>\n`;
      if (e.changefreq) xml += `    <changefreq>${this._escapeXml(e.changefreq)}</changefreq>\n`;
      if (e.priority) xml += `    <priority>${this._escapeXml(e.priority)}</priority>\n`;
      xml += '  </url>\n';
    });

    xml += '</urlset>';
    return xml;
  },

  /**
   * Export to XLS (HTML table format that Excel opens)
   */
  toXLS(entries) {
    let html = '<html><head><meta charset="UTF-8"></head><body>';
    html += '<table border="1">';
    html += '<tr><th>URL</th><th>Last Modified</th><th>Change Frequency</th><th>Priority</th></tr>';

    entries.forEach(e => {
      html += '<tr>';
      html += `<td>${this._escapeHtml(e.loc)}</td>`;
      html += `<td>${this._escapeHtml(e.lastmod)}</td>`;
      html += `<td>${this._escapeHtml(e.changefreq)}</td>`;
      html += `<td>${this._escapeHtml(e.priority)}</td>`;
      html += '</tr>';
    });

    html += '</table></body></html>';
    return html;
  },

  _escapeXml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  },

  _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  /**
   * Trigger file download
   */
  download(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};
