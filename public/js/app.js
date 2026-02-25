/**
 * App — Main application controller
 */
(function () {
  'use strict';

  // ===== STATE =====
  const state = {
    entries: [],
    currentPage: 1,
    pageSize: 25,
    compareOld: null,
    compareNew: null,
    mergeFiles: [],
    compareResults: null
  };

  // ===== UTILS =====
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function showToast(msg, type = 'info') {
    const container = $('#toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function showLoading(text = 'Processing...') {
    $('#loading .loading-text').textContent = text;
    $('#loading').classList.remove('hidden');
  }

  function hideLoading() {
    $('#loading').classList.add('hidden');
  }

  function setStatus(text) {
    $('.status-text').textContent = text;
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  /**
   * Smart URL normalization — if user enters a bare domain,
   * try common sitemap paths automatically.
   */
  function normalizeSitemapUrl(input) {
    let url = input.trim();

    // Add protocol if missing
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    try {
      const parsed = new URL(url);
      // If it's just a domain with no path (or just '/'), append /sitemap.xml
      if (parsed.pathname === '/' || parsed.pathname === '') {
        return {
          primary: parsed.origin + '/sitemap.xml',
          fallbacks: [
            parsed.origin + '/sitemap_index.xml',
            parsed.origin + '/sitemap/',
          ],
          wasBareDomain: true
        };
      }
      return { primary: url, fallbacks: [], wasBareDomain: false };
    } catch {
      return { primary: url, fallbacks: [], wasBareDomain: false };
    }
  }

  /**
   * Fetch sitemap via API with better error handling
   */
  async function fetchSitemapFromAPI(url) {
    const resp = await fetch('/api/fetch-sitemap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    // Handle non-JSON responses (e.g., Vercel 404 HTML page)
    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      if (resp.status === 404) {
        throw new Error('API endpoint not found. The serverless function may not be deployed correctly.');
      }
      throw new Error(`Unexpected response from API (HTTP ${resp.status}). Check your deployment.`);
    }

    const data = await resp.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch sitemap');
    }

    return data.data;
  }

  // ===== TAB NAVIGATION =====
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(`#panel-${btn.dataset.tab}`).classList.add('active');
    });
  });

  // ===== INPUT TOGGLE (File / URL) =====
  $$('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $$('.input-section').forEach(s => s.classList.remove('active'));
      $(`#input-${btn.dataset.input}`).classList.add('active');
    });
  });

  // ===== DROP ZONE HELPERS =====
  function setupDropZone(zoneId, inputId, onFile) {
    const zone = $(zoneId);
    const input = $(inputId);

    zone.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) {
        onFile(e.dataTransfer.files);
      }
    });

    input.addEventListener('change', () => {
      if (input.files.length > 0) {
        onFile(input.files);
      }
    });
  }

  // ===== CONVERTER TAB =====
  async function processXML(xmlText, sourceName) {
    try {
      // Pre-validate: check if the content looks like XML
      const trimmed = xmlText.trimStart();
      if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<HTML')) {
        throw new Error(
          'Received an HTML page instead of a sitemap XML. ' +
          'The URL may be incorrect, or the site may be blocking automated requests.'
        );
      }

      if (!trimmed.startsWith('<')) {
        throw new Error(
          'The response is not valid XML. It may be plain text, JSON, or an unsupported format.'
        );
      }

      const result = SitemapParser.parse(xmlText);

      if (result.type === 'index') {
        showToast(`Sitemap index found with ${result.sitemaps.length} sitemaps`, 'info');
        setStatus(`Fetching ${result.sitemaps.length} sitemaps...`);

        let allEntries = [];
        let fetchErrors = 0;

        for (const sm of result.sitemaps) {
          try {
            showLoading(`Fetching ${sm.loc}...`);
            const subXml = await fetchSitemapFromAPI(sm.loc);
            const subResult = SitemapParser.parse(subXml);
            if (subResult.type === 'sitemap') {
              allEntries = allEntries.concat(subResult.entries);
            }
          } catch (err) {
            console.warn(`Failed to fetch sub-sitemap: ${sm.loc}`, err);
            fetchErrors++;
          }
        }

        state.entries = allEntries;

        if (fetchErrors > 0) {
          showToast(`Warning: ${fetchErrors} sub-sitemap(s) failed to load`, 'error');
        }
      } else {
        state.entries = result.entries;
      }

      if (state.entries.length === 0) {
        throw new Error('No URLs found in the sitemap. The file may be empty or in an unsupported format.');
      }

      // Update UI
      $('#file-name').textContent = sourceName;
      $('#url-count').textContent = state.entries.length.toLocaleString();
      $('#sitemap-type').textContent = result.type === 'index' ? 'Sitemap Index' : 'Sitemap';
      $('#converter-file-info').classList.remove('hidden');

      // Enable exports
      $$('.export-btn').forEach(b => b.disabled = false);

      // Show preview
      state.currentPage = 1;
      renderPreview();
      $('#data-preview-card').classList.remove('hidden');

      // Update analytics
      const stats = Analytics.analyze(state.entries);
      Analytics.render(stats);

      setStatus(`${state.entries.length} URLs loaded`);
      hideLoading();
      showToast(`Loaded ${state.entries.length} URLs`, 'success');
    } catch (err) {
      hideLoading();
      showToast(err.message, 'error');
      setStatus('Error');
    }
  }

  function renderPreview() {
    const start = (state.currentPage - 1) * state.pageSize;
    const end = Math.min(start + state.pageSize, state.entries.length);
    const pageEntries = state.entries.slice(start, end);
    const totalPages = Math.ceil(state.entries.length / state.pageSize);

    const tbody = $('#data-tbody');
    tbody.innerHTML = pageEntries.map((e, i) => `
      <tr>
        <td>${start + i + 1}</td>
        <td title="${e.loc}">${e.loc}</td>
        <td>${e.lastmod || '—'}</td>
        <td>${e.changefreq || '—'}</td>
        <td>${e.priority || '—'}</td>
      </tr>
    `).join('');

    $('#page-info').textContent = `Page ${state.currentPage} of ${totalPages}`;
    $('#prev-page').disabled = state.currentPage <= 1;
    $('#next-page').disabled = state.currentPage >= totalPages;
  }

  // File upload
  setupDropZone('#converter-dropzone', '#converter-file-input', async (files) => {
    const file = files[0];
    if (!file.name.endsWith('.xml')) {
      showToast('Please upload an XML file', 'error');
      return;
    }
    showLoading('Parsing sitemap...');
    const text = await readFile(file);
    await processXML(text, file.name);
    $('#converter-dropzone').classList.add('has-file');
  });

  // URL fetch — with auto-detection and fallbacks
  $('#fetch-url-btn').addEventListener('click', async () => {
    const rawInput = $('#sitemap-url').value.trim();
    if (!rawInput) {
      showToast('Please enter a URL', 'error');
      return;
    }

    const { primary, fallbacks, wasBareDomain } = normalizeSitemapUrl(rawInput);

    // Validate
    try {
      new URL(primary);
    } catch {
      showToast('Please enter a valid URL', 'error');
      return;
    }

    showLoading('Fetching sitemap...');
    setStatus('Fetching...');

    // Try the primary URL first
    try {
      if (wasBareDomain) {
        showLoading(`Trying ${primary}...`);
      }
      const xmlData = await fetchSitemapFromAPI(primary);
      await processXML(xmlData, primary);
      return;
    } catch (primaryErr) {
      // If bare domain, try fallbacks before giving up
      if (wasBareDomain && fallbacks.length > 0) {
        for (const fallbackUrl of fallbacks) {
          try {
            showLoading(`Trying ${fallbackUrl}...`);
            const xmlData = await fetchSitemapFromAPI(fallbackUrl);
            await processXML(xmlData, fallbackUrl);
            return;
          } catch {
            // Continue to next fallback
          }
        }
      }

      // All attempts failed
      hideLoading();
      if (wasBareDomain) {
        showToast(
          `Could not find a sitemap at ${rawInput}. Tried /sitemap.xml and /sitemap_index.xml. Please provide the full sitemap URL.`,
          'error'
        );
      } else {
        showToast(primaryErr.message, 'error');
      }
      setStatus('Error');
    }
  });

  // Allow pressing Enter in the URL input
  $('#sitemap-url').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('#fetch-url-btn').click();
    }
  });

  // Pagination
  $('#prev-page').addEventListener('click', () => {
    if (state.currentPage > 1) {
      state.currentPage--;
      renderPreview();
    }
  });

  $('#next-page').addEventListener('click', () => {
    const totalPages = Math.ceil(state.entries.length / state.pageSize);
    if (state.currentPage < totalPages) {
      state.currentPage++;
      renderPreview();
    }
  });

  // Export buttons
  $$('.export-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const format = btn.dataset.format;
      if (state.entries.length === 0) return;

      try {
        switch (format) {
          case 'csv':
            Converter.download(Converter.toCSV(state.entries), 'sitemap-data.csv', 'text/csv');
            break;
          case 'json':
            Converter.download(Converter.toJSON(state.entries), 'sitemap-data.json', 'application/json');
            break;
          case 'xls':
            Converter.download(Converter.toXLS(state.entries), 'sitemap-data.xls', 'application/vnd.ms-excel');
            break;
          case 'xml':
            Converter.download(Converter.toXML(state.entries), 'sitemap.xml', 'application/xml');
            break;
        }
        showToast(`Exported as ${format.toUpperCase()}`, 'success');
      } catch (err) {
        showToast('Export failed: ' + err.message, 'error');
      }
    });
  });

  // ===== CSV TO XML TAB =====
  setupDropZone('#csv-dropzone', '#csv-file-input', async (files) => {
    const file = files[0];
    if (!file.name.endsWith('.csv')) {
      showToast('Please upload a CSV file', 'error');
      return;
    }

    const text = await readFile(file);
    const result = SitemapParser.parseCSV(text);

    $('#csv-file-name').textContent = file.name;
    $('#csv-url-count').textContent = result.entries.length;
    $('#csv-error-count').textContent = result.errors.length;

    if (result.errors.length > 0) {
      const errEl = $('#csv-errors');
      errEl.innerHTML = result.errors.map(e => `<div>${e}</div>`).join('');
      errEl.classList.remove('hidden');
    } else {
      $('#csv-errors').classList.add('hidden');
    }

    $('#csv-info').classList.remove('hidden');
    $('#csv-dropzone').classList.add('has-file');

    // Store for conversion
    state.csvEntries = result.entries;
  });

  $('#convert-csv-btn').addEventListener('click', () => {
    if (!state.csvEntries || state.csvEntries.length === 0) {
      showToast('No valid URLs to convert', 'error');
      return;
    }

    const xml = Converter.toXML(state.csvEntries);
    Converter.download(xml, 'sitemap.xml', 'application/xml');
    showToast('Sitemap XML generated!', 'success');
  });

  // ===== COMPARE TAB =====
  async function loadCompareFile(side, files) {
    const file = files[0];
    if (!file.name.endsWith('.xml')) {
      showToast('Please upload an XML file', 'error');
      return;
    }

    const text = await readFile(file);
    const result = SitemapParser.parse(text);

    if (result.type !== 'sitemap') {
      showToast('Sitemap index comparison not supported — use direct sitemaps', 'error');
      return;
    }

    if (side === 'old') {
      state.compareOld = result.entries;
      $(`#compare-old-name`).textContent = file.name;
      $(`#compare-old-count`).textContent = result.entries.length;
      $(`#compare-old-info`).classList.remove('hidden');
      $(`#compare-drop-old`).classList.add('has-file');
    } else {
      state.compareNew = result.entries;
      $(`#compare-new-name`).textContent = file.name;
      $(`#compare-new-count`).textContent = result.entries.length;
      $(`#compare-new-info`).classList.remove('hidden');
      $(`#compare-drop-new`).classList.add('has-file');
    }

    $('#compare-btn').disabled = !(state.compareOld && state.compareNew);
  }

  setupDropZone('#compare-drop-old', '#compare-old-input', (f) => loadCompareFile('old', f));
  setupDropZone('#compare-drop-new', '#compare-new-input', (f) => loadCompareFile('new', f));

  $('#compare-btn').addEventListener('click', () => {
    if (!state.compareOld || !state.compareNew) return;

    showLoading('Comparing sitemaps...');
    setTimeout(() => {
      state.compareResults = Comparer.compare(state.compareOld, state.compareNew);
      Comparer.render(state.compareResults);
      hideLoading();
      showToast('Comparison complete', 'success');
    }, 100);
  });

  $('#download-compare-report').addEventListener('click', () => {
    if (!state.compareResults) return;
    const md = Comparer.generateReport(state.compareResults);
    Converter.download(md, 'sitemap-comparison-report.md', 'text/markdown');
    showToast('Report downloaded', 'success');
  });

  // ===== MERGE TAB =====
  setupDropZone('#merge-dropzone', '#merge-file-input', async (files) => {
    for (const file of files) {
      if (!file.name.endsWith('.xml')) continue;
      const text = await readFile(file);
      try {
        const result = SitemapParser.parse(text);
        if (result.type === 'sitemap') {
          state.mergeFiles.push({ name: file.name, entries: result.entries });
        }
      } catch (err) {
        showToast(`Error parsing ${file.name}: ${err.message}`, 'error');
      }
    }

    renderMergeFileList();
  });

  function renderMergeFileList() {
    const listEl = $('#merge-file-list');
    if (state.mergeFiles.length === 0) {
      listEl.classList.add('hidden');
      $('#merge-options').classList.add('hidden');
      $('#merge-btn').classList.add('hidden');
      return;
    }

    listEl.classList.remove('hidden');
    $('#merge-options').classList.remove('hidden');
    $('#merge-btn').classList.remove('hidden');

    listEl.innerHTML = state.mergeFiles.map((f, i) => `
      <div class="merge-file-item">
        <span><strong>${f.name}</strong> — ${f.entries.length} URLs</span>
        <button class="file-remove" data-idx="${i}" title="Remove">✕</button>
      </div>
    `).join('');

    // Attach remove handlers
    listEl.querySelectorAll('.file-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        state.mergeFiles.splice(parseInt(btn.dataset.idx), 1);
        renderMergeFileList();
      });
    });
  }

  $('#merge-btn').addEventListener('click', () => {
    if (state.mergeFiles.length < 2) {
      showToast('Upload at least 2 sitemaps to merge', 'error');
      return;
    }

    showLoading('Merging sitemaps...');
    setTimeout(() => {
      const result = Merger.merge(state.mergeFiles, {
        removeDuplicates: $('#merge-dedup').checked,
        sortByPriority: $('#merge-sort').checked
      });

      state.mergedEntries = result.entries;

      $('#merge-total').textContent = result.totalInput.toLocaleString();
      $('#merge-unique').textContent = result.uniqueCount.toLocaleString();
      $('#merge-dupes').textContent = result.duplicatesRemoved.toLocaleString();
      $('#merge-results').classList.remove('hidden');

      hideLoading();
      showToast(`Merged ${result.uniqueCount} unique URLs`, 'success');
    }, 100);
  });

  $('#download-merged').addEventListener('click', () => {
    if (!state.mergedEntries) return;
    const xml = Converter.toXML(state.mergedEntries);
    Converter.download(xml, 'merged-sitemap.xml', 'application/xml');
    showToast('Merged sitemap downloaded', 'success');
  });

  // ===== INIT =====
  setStatus('Ready');

})();
