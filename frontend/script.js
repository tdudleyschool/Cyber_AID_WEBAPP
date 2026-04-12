  // Runtime-rendered env values are injected into env-config.js by the Docker CMD.
// If env-config.js is unavailable or blocked by MIME, fetch it directly and parse the values.
function normalizeUrl(value) {
    if (!value || typeof value !== 'string') {
      return '';
    }
    let url = value.trim().replace(/\/+$/, '');
    if (!url) {
      return '';
    }

    // If the string already contains a scheme, preserve it.
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url)) {
      return url;
    }

    // If the string starts with //, use the current page protocol.
    if (url.startsWith('//')) {
      return `${window.location.protocol}${url}`;
    }

    return `${window.location.protocol}//${url}`;
  }

  let LOAD_BALANCER_URL = '';
  let SERVICE_LR_1_URL = '';
  let SERVICE_LR_2_URL = '';
  let SERVICE_LR_3_URL = '';
  let SERVICE_CNN_1_URL = '';
  let SERVICE_CNN_2_URL = '';
  let SERVICE_CNN_3_URL = '';

  async function loadEnvConfig() {
    const env = {
      LB_URL: '',
      SERVICE_LR_1: '',
      SERVICE_LR_2: '',
      SERVICE_LR_3: '',
      SERVICE_CNN_1: '',
      SERVICE_CNN_2: '',
      SERVICE_CNN_3: '',
    };

    try {
      const response = await fetch('env-config.js', { cache: 'no-store' });
      if (response.ok) {
        const text = await response.text();
        const regex = /window\.([A-Z0-9_]+)\s*=\s*"([^"]*)";/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
          if (env.hasOwnProperty(match[1])) {
            env[match[1]] = match[2] || '';
          }
        }
      } else {
        console.warn('Could not fetch env-config.js:', response.status, response.statusText);
      }
    } catch (err) {
      console.warn('Failed to load env-config.js:', err);
    }

    LOAD_BALANCER_URL = normalizeUrl(env.LB_URL || window.location.origin);
    SERVICE_LR_1_URL = normalizeUrl(env.SERVICE_LR_1 || '');
    SERVICE_LR_2_URL = normalizeUrl(env.SERVICE_LR_2 || '');
    SERVICE_LR_3_URL = normalizeUrl(env.SERVICE_LR_3 || '');
    SERVICE_CNN_1_URL = normalizeUrl(env.SERVICE_CNN_1 || '');
    SERVICE_CNN_2_URL = normalizeUrl(env.SERVICE_CNN_2 || '');
    SERVICE_CNN_3_URL = normalizeUrl(env.SERVICE_CNN_3 || '');

    console.log('Frontend service URLs:', {
      LOAD_BALANCER_URL,
      SERVICE_CNN_1_URL,
      SERVICE_CNN_2_URL,
      SERVICE_CNN_3_URL,
      SERVICE_LR_1_URL,
      SERVICE_LR_2_URL,
      SERVICE_LR_3_URL,
    });
  }

  const fileInput = document.getElementById('fileInput');
  const dropZone = document.getElementById('dropZone');
  const chooseBtn = document.getElementById('chooseBtn');
  const clearBtn = document.getElementById('clearBtn');
  const runBtn = document.getElementById('runBtn');

  const uploadPreview = document.getElementById('uploadPreview');
  const previewImg = document.getElementById('previewImg');
  const fileName = document.getElementById('fileName');
  const fileSize = document.getElementById('fileSize');

  const thresholdToggle = document.getElementById('thresholdToggle');
  const thresholdControl = document.getElementById('thresholdControl');
  const thresholdRange = document.getElementById('thresholdRange');
  const thresholdValue = document.getElementById('thresholdValue');

  const modelSelect = document.getElementById('model');
  const accuracyText = document.getElementById('accuracyText');
  const modelDescription = document.getElementById('modelDescription');

  const resultsPlaceholder = document.getElementById('resultsPlaceholder');
  const resultsCard = document.getElementById('resultsCard');

  const modelBadge = document.getElementById('modelBadge');
  const predictionText = document.getElementById('predictionText');
  const resultNote = document.getElementById('resultNote');

  const probabilityPanel = document.getElementById('probabilityPanel');
  const probabilityBar = document.getElementById('probabilityBar');
  const probabilityValue = document.getElementById('probabilityValue');
  const thresholdPanel = document.getElementById('thresholdPanel');
  const thresholdPlot = document.getElementById('thresholdPlot');
  const thresholdChart = document.getElementById('thresholdChart');

  const timeStamp = document.getElementById('timeStamp');
  const footerNote = document.getElementById('footerNote');

  const SERVICE_HEALTH_ENDPOINT = '/health';
  const STATUS_CHECK_INTERVAL_MS = 30000;
  const MAX_STARTUP_CHECKS = 8;
  let servicesReady = false;
  let currentFile = null;
  let currentRequestId = null;

  const loadingOverlay = document.createElement('div');
  loadingOverlay.className = 'loading-overlay hidden';
  loadingOverlay.innerHTML = `
    <div class="loading-card">
      <div class="loading-title">Waking up backend services</div>
      <div class="loading-description">The site is verifying that your Render backend services are active. This may take a few seconds while the services warm up.</div>
      <div class="loading-status" id="loadingStatusText">Checking service availability…</div>
    </div>
  `;
  document.body.appendChild(loadingOverlay);
  const loadingStatusText = loadingOverlay.querySelector('#loadingStatusText');

  function showLoading(message) {
    if (loadingStatusText) {
      loadingStatusText.textContent = message;
    }
    loadingOverlay.classList.remove('hidden');
  }

  function hideLoading() {
    loadingOverlay.classList.add('hidden');
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  async function checkServiceHealth(baseUrl) {
    if (!baseUrl) {
      return false;
    }
    try {
      const response = await fetchWithTimeout(`${baseUrl}${SERVICE_HEALTH_ENDPOINT}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      }, 12000);
      return response.ok;
    } catch (err) {
      return false;
    }
  }

  async function verifyServicesOnline() {
    const serviceEntries = [
      { name: 'Load Balancer', url: LOAD_BALANCER_URL },
      { name: 'CNN 1', url: SERVICE_CNN_1_URL },
      { name: 'CNN 2', url: SERVICE_CNN_2_URL },
      { name: 'CNN 3', url: SERVICE_CNN_3_URL },
      { name: 'LR 1', url: SERVICE_LR_1_URL },
      { name: 'LR 2', url: SERVICE_LR_2_URL },
      { name: 'LR 3', url: SERVICE_LR_3_URL },
    ].filter((entry) => entry.url);

    if (serviceEntries.length === 0) {
      return false;
    }

    const results = await Promise.all(serviceEntries.map(async (entry) => {
      const healthy = await checkServiceHealth(entry.url);
      return { name: entry.name, healthy };
    }));

    const unhealthy = results.filter((entry) => !entry.healthy);
    if (unhealthy.length > 0) {
      const names = unhealthy.map((entry) => entry.name).join(', ');
      showLoading(`Waiting for services to come online: ${names}`);
      return false;
    }

    hideLoading();
    return true;
  }

  async function ensureServicesReady() {
    showLoading('Waking up backend services. This may take a few seconds...');
    runBtn.disabled = true;

    for (let attempt = 1; attempt <= MAX_STARTUP_CHECKS; attempt += 1) {
      loadingStatusText.textContent = `Checking service status (attempt ${attempt}/${MAX_STARTUP_CHECKS})...`;
      const healthy = await verifyServicesOnline();
      if (healthy) {
        servicesReady = true;
        runBtn.disabled = false;
        return true;
      }
      await sleep(2500);
    }

    showLoading('One or more services are still unavailable. Please wait a moment and try again.');
    runBtn.disabled = false;
    return false;
  }
  const modelInfo = {
    cnn: { accuracy: '94%', description: '' },
    logreg: { accuracy: '88%', description: '' },
  };

  function generateRequestId() {
    return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function humanFileSize(bytes) {
    const units = ['B','KB','MB','GB'];
    let i = 0;
    let num = bytes;
    while (num >= 1024 && i < units.length - 1) {
      num /= 1024;
      i++;
    }
    return `${num.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function updateModelInfo() {
    const info = modelInfo[modelSelect.value] || { accuracy: '—', description: '' };
    accuracyText.textContent = info.accuracy;
    modelDescription.textContent = info.description;
  }

  function setPreview(file) {
    currentFile = file;

    const url = URL.createObjectURL(file);
    previewImg.src = url;

    fileName.textContent = file.name;
    fileSize.textContent = humanFileSize(file.size);
    uploadPreview.style.display = 'block';
    dropZone.classList.add('upload-filled');
  }

  function clearAll() {
    currentFile = null;
    fileInput.value = '';
    uploadPreview.style.display = 'none';
    previewImg.src = '';
    fileName.textContent = '—';
    fileSize.textContent = '—';
    dropZone.classList.remove('upload-filled');

    resultsCard.style.display = 'none';
    resultsPlaceholder.style.display = 'grid';

    predictionText.textContent = '—';
    resultNote.textContent = '—';

    probabilityPanel.style.display = 'none';
    thresholdPanel.style.display = 'none';

    timeStamp.textContent = '—';
    footerNote.textContent = 'Backend response';
  }

  chooseBtn.addEventListener('click', () => fileInput.click());
  clearBtn.addEventListener('click', clearAll);

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (JPG/PNG/etc).');
      return;
    }
    setPreview(file);
  });

  ['dragenter','dragover'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave','drop'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please drop an image file (JPG/PNG/etc).');
      return;
    }
    setPreview(file);
  });

  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
  });

  modelSelect.addEventListener('change', updateModelInfo);

  thresholdToggle.addEventListener('change', () => {
    const enabled = thresholdToggle.checked;
    thresholdRange.disabled = !enabled;
    thresholdControl.style.opacity = enabled ? '1' : '0.5';
    thresholdValue.textContent = thresholdRange.value;
  });

  thresholdRange.addEventListener('input', () => {
    thresholdValue.textContent = thresholdRange.value;
  });

  updateModelInfo();
  thresholdToggle.checked = false;
  thresholdRange.disabled = true;
  thresholdControl.style.opacity = '0.5';
  runBtn.disabled = true;

  (async () => {
    await loadEnvConfig();
    await ensureServicesReady();
    setInterval(ensureServicesReady, STATUS_CHECK_INTERVAL_MS);
  })();

  async function sendImage() {
    if (!currentFile) {
      alert('Upload an image first.');
      return;
    }

    if (!servicesReady) {
      const ready = await ensureServicesReady();
      if (!ready) {
        predictionText.textContent = 'Backend services are not ready yet.';
        resultNote.textContent = 'Please wait while the backend finishes starting.';
        footerNote.textContent = 'Service unavailable';
        timeStamp.textContent = new Date().toLocaleString();
        return;
      }
    }

    resultsPlaceholder.style.display = 'none';
    resultsCard.style.display = 'block';

    const modelValue = modelSelect.value;
    const modelLabel = modelSelect.options[modelSelect.selectedIndex].text;
    const useThreshold = thresholdToggle.checked;
    const threshold = parseFloat(thresholdRange.value);

    modelBadge.textContent = `Model: ${modelLabel}`;
    predictionText.textContent = 'Analyzing…';
    resultNote.textContent = useThreshold ? `Threshold mode: ${threshold}` : 'Standard analysis';
    probabilityPanel.style.display = 'none';
    thresholdPanel.style.display = 'none';
    footerNote.textContent = 'Calling backend…';

    const formData = new FormData();
    formData.append('file', currentFile);

    try {
      currentRequestId = generateRequestId();
      const endpoint = useThreshold ? 'predict_threshold' : 'predict';
      const url = `${LOAD_BALANCER_URL}/${endpoint}?model=${encodeURIComponent(modelValue)}${useThreshold ? `&threshold=${threshold}` : ''}`;

      const resp = await fetch(url, {
        method: 'POST',
        body: formData,
        headers: {
          'X-Request-ID': currentRequestId,
        },
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        const msg = data?.detail || data?.error || `Request failed (${resp.status})`;
        predictionText.textContent = `Error: ${msg}`;
        resultNote.textContent = `Request ID: ${currentRequestId}`;
        footerNote.textContent = 'Backend error';
        timeStamp.textContent = new Date().toLocaleString();
        return;
      }

      const responseRequestId = data?.request_id || currentRequestId;
      predictionText.textContent = `Prediction: ${data.prediction || '—'}`;

      if (useThreshold) {
        thresholdPanel.style.display = 'block';
        thresholdPlot.innerHTML = '';
        if (thresholdChart) {
          thresholdChart.querySelectorAll('.threshold-marker').forEach(el => el.remove());
        }

        const sweep = Array.isArray(data.threshold_sweep) ? data.threshold_sweep : [];
        sweep.forEach((item) => {
          const cell = document.createElement('div');
          const label = item.label || '—';
          const kind = label.toLowerCase().startsWith('m') ? 'malignant' : 'benign';
          const shortLabel = label.charAt(0).toUpperCase();
          cell.className = `threshold-cell ${kind}`;
          cell.innerHTML = `
            <span class="threshold-point">${shortLabel}</span>
            <span class="threshold-value">${item.threshold.toFixed(1)}</span>
          `;
          thresholdPlot.appendChild(cell);
        });

        const marker = document.createElement('div');
        marker.className = 'threshold-marker';
        if (thresholdChart) {
          thresholdChart.appendChild(marker);
        } else {
          thresholdPlot.appendChild(marker);
        }

        const thresholds = sweep.map(item => item.threshold);
        const selectedIndex = thresholds.indexOf(threshold);
        if (thresholdChart && selectedIndex >= 0) {
          const selectedCell = thresholdPlot.children[selectedIndex];
          if (selectedCell) {
            const cellRect = selectedCell.getBoundingClientRect();
            const chartRect = thresholdChart.getBoundingClientRect();
            const left = ((cellRect.left + cellRect.width / 2) - chartRect.left) / chartRect.width * 100;
            marker.style.left = `${left}%`;
          }
        } else {
          const left = selectedIndex >= 0
            ? ((selectedIndex + 0.5) / thresholds.length) * 100
            : ((threshold - 0.1) / 0.8) * 100;
          marker.style.left = `${left}%`;
        }

        const axisLabels = document.getElementById('thresholdAxisLabels');
        if (axisLabels) {
          axisLabels.innerHTML = '';
          sweep.forEach((item) => {
            const label = document.createElement('span');
            label.textContent = item.threshold.toFixed(1);
            axisLabels.appendChild(label);
          });
        }

        resultNote.textContent = `Threshold selected: ${threshold.toFixed(1)} • req ${responseRequestId}`;
      } else {
        probabilityPanel.style.display = 'block';
        const probability = typeof data.probability === 'number' ? data.probability : 0;
        const percentage = Math.round(probability * 10000) / 100;
        probabilityBar.style.width = `${percentage}%`;
        probabilityValue.textContent = `Probability: ${percentage.toFixed(2)}%`;
        resultNote.textContent = `Standard model prediction • req ${responseRequestId}`;
      }

      footerNote.textContent = `Backend response received • ${responseRequestId}`;
      timeStamp.textContent = new Date().toLocaleString();
    } catch (err) {
      console.error(err);
      predictionText.textContent = 'Error: Could not connect to backend.';
      resultNote.textContent = '';
      footerNote.textContent = 'Connection failed';
      timeStamp.textContent = new Date().toLocaleString();
    }
  }

  // Hook button click to sendImage
  runBtn.addEventListener('click', sendImage);