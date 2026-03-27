const grid = document.querySelector('.documents-list #documents-grid');
let activeMode = null;
const controls = document.getElementById('controls');
const state = {
  sortBy: 'new',
  filterType: 'all'
};
const openBtn = document.getElementById('open-create-form');
const form = document.getElementById('create-form');
const cancelBtn = document.getElementById('cancel-create');
function setActive(groupSelector, attr, value) {
  const group = controls?.querySelector(groupSelector);
  if (!group) return;

  group.querySelectorAll('.documents-filter').forEach(btn => {
    const v = btn.getAttribute(attr);
    const isActive = v === value;
    btn.classList.toggle('active', isActive);
    btn.classList.toggle('inactive', !isActive);
  });
}

function getDocType(doc) {
  let t = String(doc?.fileType || '').toUpperCase().trim();
  if (!t) {
    const name = String(doc?.fileName || '');
    const ext = name.includes('.') ? name.split('.').pop() : '';
    t = String(ext || '').toUpperCase().trim();
  }
  if (t === 'JPG') t = 'JPEG';
  return t;
}

function applyClientSortAndFilter(docs) {
  let out = Array.isArray(docs) ? [...docs] : [];
  if (state.filterType !== 'all') {
    out = out.filter(d => getDocType(d) === state.filterType);
  }
  if (state.sortBy === 'name') {
    out.sort((a, b) =>
      String(a?.name || '').localeCompare(String(b?.name || ''), 'ru')
    );
  } else if (state.sortBy === 'old') {
    out.sort((a, b) => new Date(a?.uploadDate || 0) - new Date(b?.uploadDate || 0));
  } else {
    out.sort((a, b) => new Date(b?.uploadDate || 0) - new Date(a?.uploadDate || 0));
  }

  return out;
}
function exitCreateModeUI({ rerender = true } = {}) {
  if (form) form.style.display = 'none';

  if (openBtn) {
    openBtn.style.display = 'flex';
    if (openBtn.parentElement !== grid) grid.prepend(openBtn);
    else grid.prepend(openBtn);
  }

  activeMode = null;

  if (rerender) {
    renderDocuments(applyClientSortAndFilter(window.__documentsCache || []));
  }
}

function closeCreateIfOpen({ rerender = true } = {}) {
  if (activeMode !== 'create') return false;
  const nameEl = document.getElementById('new-name');
  const fileEl = document.getElementById('new-file');
  if (nameEl) nameEl.value = '';
  if (fileEl) fileEl.value = '';

  exitCreateModeUI({ rerender });
  return true;
}

function closeEditIfOpen() {
  if (activeMode !== 'edit') return false;
  const editCancel = grid?.querySelector('.document-btn--cancel');
  if (editCancel) {
    editCancel.click();
    return true;
  }
  activeMode = null;
  renderDocuments(applyClientSortAndFilter(window.__documentsCache || []));
  return true;
}
async function loadDocuments() {
  const res = await fetch('/api/documents');
  const documents = await res.json();

  window.__documentsCache = documents;
  renderDocuments(applyClientSortAndFilter(documents));
}
function renderDocuments(documents) {
  if (!grid) return;
  grid.querySelectorAll('[data-doc-card="1"]').forEach(el => el.remove());
  if (openBtn && openBtn.parentElement !== grid) {
    grid.prepend(openBtn);
  }
  if (activeMode === 'create') {
    if (form) {
      form.style.display = 'flex';
      if (form.parentElement !== grid) grid.prepend(form);
      else grid.prepend(form);
    }
    if (openBtn) openBtn.style.display = 'none';
  } else {
    if (form) form.style.display = 'none';
    if (openBtn) {
      openBtn.style.display = 'flex';
      grid.prepend(openBtn);
    }
  }
  documents.forEach(doc => {
    const card = document.createElement('div');
    card.className = 'document-card';
    card.dataset.docCard = '1';

    const uploadDate = new Date(doc.uploadDate).toLocaleDateString();
    const shortFilename = doc.fileName.split('-').slice(1).join('-');

    card.innerHTML = `
      <div class="document-date">${uploadDate}</div>
      <div class="document-name">${doc.name}</div>
      <div class="document-filename">${shortFilename}</div>

      <div class="document-actions-row">
        <button class="document-btn document-btn-primary" onclick="editDocument(${doc.id}, this)">Редактирование</button>
        <button class="document-btn document-btn-outline" onclick="deleteDocument(${doc.id})">Удаление</button>
      </div>

      <button class="document-btn-wide" onclick="downloadFile('${doc.fileName}')">Скачивание</button>
    `;

    grid.appendChild(card);
  });
}
if (controls) {
  setActive('[data-kind="sort"]', 'data-sort', state.sortBy);
  setActive('[data-kind="filter"]', 'data-filter', state.filterType);

  controls.addEventListener('click', (e) => {
    if (activeMode) return;

    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.sort) {
      state.sortBy = btn.dataset.sort.toLowerCase();
      setActive('[data-kind="sort"]', 'data-sort', state.sortBy);
      renderDocuments(applyClientSortAndFilter(window.__documentsCache || []));
      return;
    }

    if (btn.dataset.filter) {
      state.filterType = btn.dataset.filter.toUpperCase();
      if (state.filterType === 'ALL') state.filterType = 'all';
      setActive('[data-kind="filter"]', 'data-filter', state.filterType === 'all' ? 'all' : state.filterType);
      renderDocuments(applyClientSortAndFilter(window.__documentsCache || []));
      return;
    }
  });
}
function downloadFile(fileName) {
  window.location.href = `/download/${fileName}`;
}
async function deleteDocument(id) {
  if (activeMode) return;
  if (!confirm('Удаление документа?')) return;

  await fetch(`/api/documents/${id}`, { method: 'DELETE' });
  loadDocuments();
}
async function editDocument(id, btn) {
  if (activeMode === 'create') {
    closeCreateIfOpen({ rerender: false });
  }

  if (activeMode) return;
  activeMode = 'edit';

  const card = btn.closest('.document-card');
  const originalHTML = card.innerHTML;
  const res = await fetch(`/api/documents/${id}`);
  const doc = await res.json();

  const shortFilename = doc.fileName.split('-').slice(1).join('-');
  card.innerHTML = `
      <input type="text" class="document-input" id="edit-name-${id}" value="${doc.name}">
      <input type="file" class="document-input" id="edit-file-${id}">
      <div class="document-current-file" id="current-file-${id}">
          Текущий файл: ${shortFilename}
      </div>
      <div class="document-actions">
          <button class="document-btn document-btn--save">Сохранение</button>
          <button class="document-btn document-btn--cancel">Отмена</button>
      </div>
  `;

  const fileInput = card.querySelector(`#edit-file-${id}`);
  const fileLabel = card.querySelector(`#current-file-${id}`);
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) {
      fileLabel.textContent = `Выбранный файл: ${fileInput.files[0].name}`;
    }
  });

  const saveBtn = card.querySelector('.document-btn--save');
  const cancelBtnLocal = card.querySelector('.document-btn--cancel');
  cancelBtnLocal.addEventListener('click', () => {
    card.innerHTML = originalHTML;
    activeMode = null;
    renderDocuments(applyClientSortAndFilter(window.__documentsCache || []));
  });
  saveBtn.addEventListener('click', async () => {
    const newName = card.querySelector(`#edit-name-${id}`).value.trim();
    const file = fileInput.files[0];

    if (!newName) {
      alert('Ввод названия документа');
      return;
    }
    const updateData = {
      name: newName,
      fileName: doc.fileName,
      fileType: doc.fileType,
      filePath: doc.filePath
    };
    if (file) {
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch('/upload', {
        method: 'POST',
        body: formData
      });

      const uploadData = await uploadRes.json();

      updateData.fileName = uploadData.fileName;
      updateData.fileType = file.name.split('.').pop().toUpperCase();
      updateData.filePath = `uploads/${uploadData.fileName}`;
    }
    await fetch(`/api/documents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData)
    });

    activeMode = null;
    loadDocuments();
  });
}
if (openBtn && form) {
  openBtn.addEventListener('click', () => {
    if (activeMode === 'edit') closeEditIfOpen();
    if (activeMode) return;

    activeMode = 'create';
    renderDocuments(applyClientSortAndFilter(window.__documentsCache || []));
  });
  openBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openBtn.click();
    }
  });
}
if (cancelBtn && form) {
  cancelBtn.addEventListener('click', (e) => {
    e.preventDefault();

    const nameEl = document.getElementById('new-name');
    const fileEl = document.getElementById('new-file');

    if (nameEl) nameEl.value = '';
    if (fileEl) fileEl.value = '';
    exitCreateModeUI({ rerender: true });
  });
}
document.getElementById('create-btn').addEventListener('click', async (e) => {
  e.preventDefault();

  if (activeMode !== 'create') return;

  const name = document.getElementById('new-name').value.trim();
  const fileInput = document.getElementById('new-file');
  const file = fileInput.files[0];

  if (!name || !file) {
    alert('Заполнение имени и выбор файла');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    const uploadRes = await fetch('/upload', {
      method: 'POST',
      body: formData
    });

    if (!uploadRes.ok) {
      throw new Error('Ошибка загрузки файла');
    }

    const uploadData = await uploadRes.json();
    const documentData = {
      name,
      fileName: uploadData.fileName,
      fileType: file.name.split('.').pop().toUpperCase(),
      filePath: `uploads/${uploadData.fileName}`
    };

    const createRes = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(documentData)
    });

    if (!createRes.ok) {
      throw new Error('Ошибка создания документа');
    }
    document.getElementById('new-name').value = '';
    fileInput.value = '';

    activeMode = null;
    await loadDocuments();
  } catch (error) {
    console.error('Ошибка создания документа:', error);
    alert('Не удалось создать документ: ' + error.message);
  }
});
loadDocuments();