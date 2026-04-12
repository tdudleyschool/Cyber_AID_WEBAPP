  // ✅ CHANGE THIS if your backend runs on a different URL/port
  const API_URL = "http://127.0.0.1:8000";

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

  let currentFile = null;
  const modelInfo = {
    cnn: { accuracy: '94%', description: '' },
    logreg: { accuracy: '88%', description: '' },
  };

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

  // ✅ REAL BACKEND CALL

  async function sendImage() {
    if (!currentFile) {
      alert('Upload an image first.');
      return;
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
      const endpoint = useThreshold ? 'predict_threshold' : 'predict';
      let url = `${API_URL}/${endpoint}?model=${encodeURIComponent(modelValue)}`;
      if (useThreshold) {
        url += `&threshold=${threshold}`;
      }

      const resp = await fetch(url, {
        method: 'POST',
        body: formData
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        const msg = data?.detail || data?.error || `Request failed (${resp.status})`;
        predictionText.textContent = `Error: ${msg}`;
        resultNote.textContent = '';
        footerNote.textContent = 'Backend error';
        timeStamp.textContent = new Date().toLocaleString();
        return;
      }

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

        resultNote.textContent = `Threshold selected: ${threshold.toFixed(1)}`;
      } else {
        probabilityPanel.style.display = 'block';
        const probability = typeof data.probability === 'number' ? data.probability : 0;
        const percentage = Math.round(probability * 10000) / 100;
        probabilityBar.style.width = `${percentage}%`;
        probabilityValue.textContent = `Probability: ${percentage.toFixed(2)}%`;
        resultNote.textContent = 'Standard model prediction';
      }

      footerNote.textContent = 'Backend response received';
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