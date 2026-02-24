/**
 * Analytics — Compute and render sitemap statistics
 */
const Analytics = {
  /**
   * Analyze entries and return stats object
   */
  analyze(entries) {
    if (!entries || entries.length === 0) return null;

    const total = entries.length;
    const domains = new Map();
    let httpsCount = 0;
    let hasLastmod = 0;
    let hasChangefreq = 0;
    let hasPriority = 0;
    const freqDist = {};
    const priorities = [];
    const dates = [];

    entries.forEach(e => {
      // Domain extraction
      try {
        const url = new URL(e.loc);
        const domain = url.hostname;
        domains.set(domain, (domains.get(domain) || 0) + 1);
        if (url.protocol === 'https:') httpsCount++;
      } catch {}

      // Field coverage
      if (e.lastmod) { hasLastmod++; dates.push(e.lastmod); }
      if (e.changefreq) {
        hasChangefreq++;
        const freq = e.changefreq.toLowerCase();
        freqDist[freq] = (freqDist[freq] || 0) + 1;
      }
      if (e.priority) {
        hasPriority++;
        priorities.push(parseFloat(e.priority));
      }
    });

    // Priority distribution
    const highPriority = priorities.filter(p => p >= 0.7).length;
    const medPriority = priorities.filter(p => p >= 0.4 && p < 0.7).length;
    const lowPriority = priorities.filter(p => p < 0.4).length;
    const avgPriority = priorities.length > 0
      ? (priorities.reduce((a, b) => a + b, 0) / priorities.length).toFixed(2)
      : '—';

    // Sort domains by count
    const topDomains = [...domains.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    // Date range
    const sortedDates = dates.sort();
    const oldestDate = sortedDates[0] || '—';
    const newestDate = sortedDates[sortedDates.length - 1] || '—';

    return {
      total,
      domainCount: domains.size,
      httpsPercent: total > 0 ? ((httpsCount / total) * 100).toFixed(1) : 0,
      avgPriority,
      coverage: {
        lastmod: { count: hasLastmod, pct: ((hasLastmod / total) * 100).toFixed(1) },
        changefreq: { count: hasChangefreq, pct: ((hasChangefreq / total) * 100).toFixed(1) },
        priority: { count: hasPriority, pct: ((hasPriority / total) * 100).toFixed(1) }
      },
      freqDist,
      priorityDist: { high: highPriority, medium: medPriority, low: lowPriority },
      topDomains,
      dateRange: { oldest: oldestDate, newest: newestDate }
    };
  },

  /**
   * Render analytics to the DOM
   */
  render(stats) {
    if (!stats) return;

    // Top stats cards
    const topEl = document.getElementById('stats-top');
    topEl.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${stats.total.toLocaleString()}</div>
        <div class="stat-label">Total URLs</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.domainCount}</div>
        <div class="stat-label">Domains</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.httpsPercent}%</div>
        <div class="stat-label">HTTPS</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.avgPriority}</div>
        <div class="stat-label">Avg Priority</div>
      </div>
    `;

    // Field coverage
    const coverageEl = document.getElementById('field-coverage');
    coverageEl.innerHTML = this._barRow('lastmod', stats.coverage.lastmod.pct, `${stats.coverage.lastmod.count} / ${stats.total}`) +
      this._barRow('changefreq', stats.coverage.changefreq.pct, `${stats.coverage.changefreq.count} / ${stats.total}`, 'blue') +
      this._barRow('priority', stats.coverage.priority.pct, `${stats.coverage.priority.count} / ${stats.total}`, 'yellow');

    // Change freq dist
    const freqEl = document.getElementById('change-freq-chart');
    const maxFreq = Math.max(...Object.values(stats.freqDist), 1);
    const freqOrder = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
    let freqHTML = '';
    freqOrder.forEach(f => {
      if (stats.freqDist[f]) {
        const pct = (stats.freqDist[f] / maxFreq * 100).toFixed(1);
        freqHTML += this._barRow(f, pct, stats.freqDist[f].toLocaleString());
      }
    });
    // Any other keys
    Object.keys(stats.freqDist).forEach(f => {
      if (!freqOrder.includes(f)) {
        const pct = (stats.freqDist[f] / maxFreq * 100).toFixed(1);
        freqHTML += this._barRow(f, pct, stats.freqDist[f].toLocaleString());
      }
    });
    freqEl.innerHTML = freqHTML || '<p style="color:var(--text-dim);font-size:0.82rem">No change frequency data</p>';

    // Priority dist
    const priEl = document.getElementById('priority-chart');
    const maxPri = Math.max(stats.priorityDist.high, stats.priorityDist.medium, stats.priorityDist.low, 1);
    priEl.innerHTML =
      this._barRow('High (≥0.7)', (stats.priorityDist.high / maxPri * 100).toFixed(1), stats.priorityDist.high, '') +
      this._barRow('Med (0.4-0.7)', (stats.priorityDist.medium / maxPri * 100).toFixed(1), stats.priorityDist.medium, 'yellow') +
      this._barRow('Low (<0.4)', (stats.priorityDist.low / maxPri * 100).toFixed(1), stats.priorityDist.low, 'red');

    // Top domains
    const domEl = document.getElementById('top-domains');
    const maxDom = stats.topDomains.length > 0 ? stats.topDomains[0][1] : 1;
    let domHTML = '';
    stats.topDomains.forEach(([domain, count]) => {
      const pct = (count / maxDom * 100).toFixed(1);
      domHTML += this._barRow(domain, pct, count.toLocaleString(), 'blue');
    });
    domEl.innerHTML = domHTML || '<p style="color:var(--text-dim);font-size:0.82rem">No domain data</p>';

    // Show content
    document.getElementById('analytics-empty').classList.add('hidden');
    document.getElementById('analytics-content').classList.remove('hidden');
  },

  _barRow(label, pct, value, colorClass = '') {
    return `
      <div class="bar-row">
        <span class="bar-label" title="${label}">${label}</span>
        <div class="bar-track">
          <div class="bar-fill ${colorClass}" style="width:${pct}%"></div>
        </div>
        <span class="bar-value">${value}</span>
      </div>
    `;
  }
};
