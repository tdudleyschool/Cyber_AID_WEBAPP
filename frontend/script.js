  // ✅ CHANGE THIS if your backend runs on a different URL/port
  const API_URL = "http://127.0.0.1:8000";

  const fileInput = document.getElementById('fileInput');
  const dropZone = document.getElementById('dropZone');
  const chooseBtn = document.getElementById('chooseBtn');
  const clearBtn = document.getElementById('clearBtn');
  const runBtn = document.getElementById('runBtn');

  const preview = document.getElementById('preview');
  const previewImg = document.getElementById('previewImg');
  const fileName = document.getElementById('fileName');
  const fileSize = document.getElementById('fileSize');

  const modelSelect = document.getElementById('model');

  const resultsPlaceholder = document.getElementById('resultsPlaceholder');
  const resultsCard = document.getElementById('resultsCard');

  const modelBadge = document.getElementById('modelBadge');
  const predictionText = document.getElementById('predictionText');

  const recallText = document.getElementById('recallText');
  const sensText = document.getElementById('sensText');
  const specText = document.getElementById('specText');
  const precText = document.getElementById('precText');
  const f1Text = document.getElementById('f1Text');
  const npvText = document.getElementById('npvText');

  const timeStamp = document.getElementById('timeStamp');
  const footerNote = document.getElementById('footerNote');

  let currentFile = null;

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

  function setPreview(file) {
    currentFile = file;

    const url = URL.createObjectURL(file);
    previewImg.src = url;

    fileName.textContent = file.name;
    fileSize.textContent = humanFileSize(file.size);
    preview.style.display = 'block';
  }

  function clearAll() {
    currentFile = null;
    fileInput.value = '';
    preview.style.display = 'none';
    previewImg.src = '';
    fileName.textContent = '—';
    fileSize.textContent = '—';

    resultsCard.style.display = 'none';
    resultsPlaceholder.style.display = 'grid';

    predictionText.textContent = '—';

    recallText.textContent = '—%';
    sensText.textContent = '—%';
    specText.textContent = '—%';
    precText.textContent = '—%';
    f1Text.textContent = '—%';
    npvText.textContent = '—%';

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
    modelBadge.textContent = `Model: ${modelLabel}`;

    predictionText.textContent = 'Analyzing…';

    recallText.textContent = '—%';
    sensText.textContent = '—%';
    specText.textContent = '—%';
    precText.textContent = '—%';
    f1Text.textContent = '—%';
    npvText.textContent = '—%';

    footerNote.textContent = 'Calling backend…';

    const formData = new FormData();
    formData.append('file', currentFile);

    try {
      const url = `${API_URL}/predict?model=${encodeURIComponent(modelValue)}`;

      const resp = await fetch(url, {
        method: 'POST',
        body: formData
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        const msg = data?.detail || data?.error || `Request failed (${resp.status})`;
        predictionText.textContent = `Error: ${msg}`;
        footerNote.textContent = 'Backend error';
        timeStamp.textContent = new Date().toLocaleString();
        return;
      }

      let label = data.prediction === 0 ? "Benign" : "Malignant";
      predictionText.textContent = `Prediction: ${label}`;

      // Display metrics
      recallText.textContent = (data.sensitivity * 100).toFixed(2) + '%';
      sensText.textContent = (data.sensitivity * 100).toFixed(2) + '%';
      f1Text.textContent = (data.f1 * 100).toFixed(2) + '%';

      specText.textContent = '—%';
      precText.textContent = '—%';
      npvText.textContent = '—%';

      footerNote.textContent = 'Backend response received';
      timeStamp.textContent = new Date().toLocaleString();

    } catch (err) {
      console.error(err);
      predictionText.textContent = 'Error: Could not connect to backend.';
      footerNote.textContent = 'Connection failed';
      timeStamp.textContent = new Date().toLocaleString();
    }
  }

  // Hook button click to sendImage
  runBtn.addEventListener('click', sendImage);