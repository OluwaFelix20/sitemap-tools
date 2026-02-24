/**
 * Merger — Combine multiple sitemaps into one
 */
const Merger = {
  /**
   * Merge multiple arrays of sitemap entries
   * @param {Array<{name: string, entries: Array}>} sitemaps
   * @param {Object} options - { removeDuplicates, sortByPriority }
   */
  merge(sitemaps, options = {}) {
    const { removeDuplicates = true, sortByPriority = false } = options;

    let totalInput = 0;
    const urlMap = new Map();

    sitemaps.forEach(sitemap => {
      sitemap.entries.forEach(entry => {
        totalInput++;
        const existing = urlMap.get(entry.loc);

        if (!existing) {
          urlMap.set(entry.loc, { ...entry, _source: sitemap.name });
        } else if (removeDuplicates) {
          // Prefer newer entry (by lastmod) or later source
          if (entry.lastmod && (!existing.lastmod || entry.lastmod > existing.lastmod)) {
            urlMap.set(entry.loc, { ...entry, _source: sitemap.name });
          }
        } else {
          // Keep all — use unique key
          const key = entry.loc + '#' + totalInput;
          urlMap.set(key, { ...entry, _source: sitemap.name });
        }
      });
    });

    let merged = Array.from(urlMap.values());

    if (sortByPriority) {
      merged.sort((a, b) => {
        const pa = a.priority ? parseFloat(a.priority) : 0.5;
        const pb = b.priority ? parseFloat(b.priority) : 0.5;
        return pb - pa;
      });
    }

    return {
      entries: merged,
      totalInput,
      uniqueCount: merged.length,
      duplicatesRemoved: totalInput - merged.length
    };
  }
};
