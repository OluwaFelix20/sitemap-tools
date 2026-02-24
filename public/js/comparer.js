/**
 * Comparer — Compare two sitemaps and identify changes
 */
const Comparer = {
  /**
   * Compare old and new sitemap entries
   * Returns { added, removed, modified, unchanged }
   */
  compare(oldEntries, newEntries) {
    const oldMap = new Map();
    const newMap = new Map();

    oldEntries.forEach(e => oldMap.set(e.loc, e));
    newEntries.forEach(e => newMap.set(e.loc, e));

    const added = [];
    const removed = [];
    const modified = [];
    const unchanged = [];

    // Find added and modified
    newMap.forEach((newEntry, url) => {
      if (!oldMap.has(url)) {
        added.push(newEntry);
      } else {
        const oldEntry = oldMap.get(url);
        const changes = this._findChanges(oldEntry, newEntry);
        if (changes.length > 0) {
          modified.push({ url, changes, oldEntry, newEntry });
        } else {
          unchanged.push(newEntry);
        }
      }
    });

    // Find removed
    oldMap.forEach((oldEntry, url) => {
      if (!newMap.has(url)) {
        removed.push(oldEntry);
      }
    });

    return { added, removed, modified, unchanged };
  },

  _findChanges(oldE, newE) {
    const changes = [];
    const fields = ['lastmod', 'changefreq', 'priority'];
    fields.forEach(f => {
      if ((oldE[f] || '') !== (newE[f] || '')) {
        changes.push({
          field: f,
          from: oldE[f] || '(empty)',
          to: newE[f] || '(empty)'
        });
      }
    });
    return changes;
  },

  /**
   * Render comparison results
   */
  render(results) {
    // Stats row
    const statsEl = document.getElementById('compare-stats');
    statsEl.innerHTML = `
      <div class="stat-card">
        <div class="stat-value" style="color:var(--accent)">${results.added.length}</div>
        <div class="stat-label">Added</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--red)">${results.removed.length}</div>
        <div class="stat-label">Removed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--yellow)">${results.modified.length}</div>
        <div class="stat-label">Modified</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--blue)">${results.unchanged.length}</div>
        <div class="stat-label">Unchanged</div>
      </div>
    `;

    // Detail sections
    const detailsEl = document.getElementById('compare-details');
    let html = '';

    if (results.added.length > 0) {
      html += this._renderSection('Added URLs', 'green', results.added.map(e =>
        `<div class="compare-url-item">+ ${this._esc(e.loc)}</div>`
      ).join(''));
    }

    if (results.removed.length > 0) {
      html += this._renderSection('Removed URLs', 'red', results.removed.map(e =>
        `<div class="compare-url-item">- ${this._esc(e.loc)}</div>`
      ).join(''));
    }

    if (results.modified.length > 0) {
      html += this._renderSection('Modified URLs', 'yellow', results.modified.map(m => {
        const changeText = m.changes.map(c => `${c.field}: ${c.from} → ${c.to}`).join(', ');
        return `<div class="compare-url-item">~ ${this._esc(m.url)}<span class="change-detail">${this._esc(changeText)}</span></div>`;
      }).join(''));
    }

    if (results.unchanged.length > 0) {
      html += this._renderSection('Unchanged URLs', 'blue',
        `<div class="compare-url-item" style="color:var(--text-muted)">${results.unchanged.length} URLs unchanged</div>`
      );
    }

    detailsEl.innerHTML = html;
    document.getElementById('compare-results').classList.remove('hidden');
  },

  _renderSection(title, color, content) {
    return `
      <div class="compare-section">
        <div class="compare-section-header" onclick="this.nextElementSibling.classList.toggle('hidden')">
          <span>${title}</span>
          <span class="badge badge-${color}">▾</span>
        </div>
        <div class="compare-urls">${content}</div>
      </div>
    `;
  },

  _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  /**
   * Generate Markdown comparison report
   */
  generateReport(results) {
    let md = '# Sitemap Comparison Report\n\n';
    md += `Generated: ${new Date().toISOString()}\n\n`;
    md += '## Summary\n\n';
    md += `| Metric | Count |\n|--------|-------|\n`;
    md += `| Added | ${results.added.length} |\n`;
    md += `| Removed | ${results.removed.length} |\n`;
    md += `| Modified | ${results.modified.length} |\n`;
    md += `| Unchanged | ${results.unchanged.length} |\n\n`;

    if (results.added.length > 0) {
      md += '## Added URLs\n\n';
      results.added.forEach(e => md += `- ${e.loc}\n`);
      md += '\n';
    }

    if (results.removed.length > 0) {
      md += '## Removed URLs\n\n';
      results.removed.forEach(e => md += `- ${e.loc}\n`);
      md += '\n';
    }

    if (results.modified.length > 0) {
      md += '## Modified URLs\n\n';
      results.modified.forEach(m => {
        md += `### ${m.url}\n`;
        m.changes.forEach(c => {
          md += `- **${c.field}**: \`${c.from}\` → \`${c.to}\`\n`;
        });
        md += '\n';
      });
    }

    return md;
  }
};
