// const grid = document.querySelector('.documents-list #documents-grid');
// const sortButtons = document.querySelectorAll('.documents-filters button');

// // выделение кнопки "новые" по умолчанию
// document.querySelector('.documents-filters button[data-sort="new"]')?.classList.add('active');

// let currentSort = 'new';
// let activeMode = null; // null, 'create' или 'edit'

// // загрузка документов с сервера
// async function loadDocuments() {
//     let url = '/api/documents';

//     if (currentSort !== 'new') {
//         url += `?sortBy=${currentSort}`;
//     }

//     const res = await fetch(url);
//     const documents = await res.json();
//     window.__documentsCache = documents;
//     renderDocuments(documents);
// }

// // отрисовка документов
// function renderDocuments(documents) {
//   const openBtn = document.getElementById('open-create-form');
//   const form = document.getElementById('create-form');

//   // 1) удаляем ТОЛЬКО карточки документов, которые рисуем сами
//   grid.querySelectorAll('[data-doc-card="1"]').forEach(el => el.remove());

//   // 2) гарантируем, что кнопка находится в НУЖНОЙ сетке
//   // (даже если в HTML она лежит во втором documents-grid)
//   if (openBtn && openBtn.parentElement !== grid) {
//     grid.prepend(openBtn);
//   }

//   // 3) первый элемент: либо форма, либо кнопка (форма именно на месте кнопки)
//   if (activeMode === 'create') {
//     if (form) {
//       form.style.display = 'flex';
//       // ставим форму первой
//       if (form.parentElement !== grid) grid.prepend(form);
//       else grid.prepend(form);
//     }
//     if (openBtn) openBtn.style.display = 'none';
//   } else {
//     if (form) form.style.display = 'none';
//     if (openBtn) {
//       openBtn.style.display = 'flex';
//       grid.prepend(openBtn); // кнопка всегда первая
//     }
//   }

//   // 4) рисуем документы
//   documents.forEach(doc => {
//     const card = document.createElement('div');
//     card.className = 'document-card';
//     card.dataset.docCard = '1';

//     const uploadDate = new Date(doc.uploadDate).toLocaleDateString();
//     const shortFilename = doc.fileName.split('-').slice(1).join('-');

//     card.innerHTML = `
//       <div class="document-date">${uploadDate}</div>
//       <div class="document-name">${doc.name}</div>
//       <div class="document-filename">${shortFilename}</div>

//       <div class="document-actions-row">
//         <button class="document-btn document-btn-primary" onclick="editDocument(${doc.id}, this)">Редактирование</button>
//         <button class="document-btn document-btn-outline" onclick="deleteDocument(${doc.id})">Удаление</button>
//       </div>

//       <button class="document-btn-wide" onclick="downloadFile('${doc.fileName}')">Скачивание</button>
//     `;

//     grid.appendChild(card);
//   });
// }
// // редактирование документа
// async function editDocument(id, btn) {
//     if (activeMode) return; // блокировка нескольких редактирований
//     activeMode = 'edit';

//     const card = btn.closest('.document-card');
//     const originalHTML = card.innerHTML; // сохранение для отмены

//     // получение данных документа
//     const res = await fetch(`/api/documents/${id}`);
//     const doc = await res.json();

//     const shortFilename = doc.fileName.split('-').slice(1).join('-');

//     // вставка формы редактирования
//     card.innerHTML = `
//         <input type="text" class="document-input" id="edit-name-${id}" value="${doc.name}">
//         <input type="file" class="document-input" id="edit-file-${id}">
//         <div class="document-current-file" id="current-file-${id}">
//             Текущий файл: ${shortFilename}
//         </div>
//         <div class="document-actions">
//             <button class="document-btn document-btn--save">Сохранение</button>
//             <button class="document-btn document-btn--cancel">Отмена</button>
//         </div>
//     `;

//     const fileInput = card.querySelector(`#edit-file-${id}`);
//     const fileLabel = card.querySelector(`#current-file-${id}`);

//     // обновление названия при выборе файла
//     fileInput.addEventListener('change', () => {
//         if (fileInput.files[0]) {
//             fileLabel.textContent = `Выбранный файл: ${fileInput.files[0].name}`;
//         }
//     });

//     const saveBtn = card.querySelector('.document-btn--save');
//     const cancelBtn = card.querySelector('.document-btn--cancel');

//     // отмена редактирования
//     cancelBtn.addEventListener('click', () => {
//         card.innerHTML = originalHTML;
//         activeMode = null;
//     });

//     // сохранение изменений
//     saveBtn.addEventListener('click', async () => {
//         const newName = card.querySelector(`#edit-name-${id}`).value.trim();
//         const file = fileInput.files[0];

//         if (!newName) {
//             alert('Ввод названия документа');
//             return;
//         }

//         // подготовка данных для отправки
//         const updateData = {
//             name: newName,
//             fileName: doc.fileName,
//             fileType: doc.fileType,
//             filePath: doc.filePath
//         };

//         // обработка нового файла
//         if (file) {
//             const formData = new FormData();
//             formData.append('file', file);

//             const uploadRes = await fetch('/upload', {
//                 method: 'POST',
//                 body: formData
//             });

//             const uploadData = await uploadRes.json();

//             updateData.fileName = uploadData.fileName;
//             updateData.fileType = file.name.split('.').pop().toUpperCase();
//             updateData.filePath = `uploads/${uploadData.fileName}`;
//         }

//         // отправка на сервер
//         await fetch(`/api/documents/${id}`, {
//             method: 'PUT',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify(updateData)
//         });

//         activeMode = null;
//         loadDocuments();
//     });
// }

// // создание документа
// const openBtn = document.getElementById('open-create-form');
// const form = document.getElementById('create-form');
// const cancelBtn = document.getElementById('cancel-create');

// // показ формы создания
// if (openBtn && form) {
//   openBtn.addEventListener('click', () => {
//     if (activeMode) return;

//     activeMode = 'create';
//     renderDocuments(window.__documentsCache || []); // чтобы сразу перерисовало
//   });

//   // чтобы карточка реагировала и на Enter
//   openBtn.addEventListener('keydown', (e) => {
//     if (e.key === 'Enter' || e.key === ' ') {
//       e.preventDefault();
//       openBtn.click();
//     }
//   });
// }

// // скрытие формы создания
// if (cancelBtn && form) {
//   cancelBtn.addEventListener('click', () => {
//     // очистка полей
//     document.getElementById('new-name').value = '';
//     document.getElementById('new-file').value = '';

//     activeMode = null;
//     renderDocuments(window.__documentsCache || []);
//   });
// }

// // создание документа
// document.getElementById('create-btn').addEventListener('click', async () => {
//     if (activeMode !== 'create') return;

//     const name = document.getElementById('new-name').value.trim();
//     const fileInput = document.getElementById('new-file');
//     const file = fileInput.files[0];

//     if (!name || !file) {
//         alert('Заполнение имени и выбор файла');
//         return;
//     }

//     const formData = new FormData();
//     formData.append('file', file);

//     try {
//         // загрузка файла на сервер
//         const uploadRes = await fetch('/upload', {
//             method: 'POST',
//             body: formData
//         });

//         if (!uploadRes.ok) {
//             throw new Error('Ошибка загрузки файла');
//         }

//         const uploadData = await uploadRes.json();

//         // создание записи о документе
//         const documentData = {
//             name,
//             fileName: uploadData.fileName,
//             fileType: file.name.split('.').pop().toUpperCase(),
//             filePath: `uploads/${uploadData.fileName}`
//         };

//         const createRes = await fetch('/api/documents', {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify(documentData)
//         });

//         if (!createRes.ok) {
//             throw new Error('Ошибка создания документа');
//         }

//         // очистка формы
//         document.getElementById('new-name').value = '';
//         fileInput.value = '';


//         // сброс режима
//         activeMode = null;

//         // обновление списка
//         await loadDocuments();

//     } catch (error) {
//         console.error('Ошибка создания документа:', error);
//         alert('Не удалось создать документ: ' + error.message);
//         // сохранение активного режима при ошибке
//     }
// });

// // начальная загрузка документов
// loadDocuments();

// documents.js (полная версия)

const grid = document.querySelector('.documents-list #documents-grid');

// =========================
// STATE
// =========================
let activeMode = null; // null, 'create' или 'edit'

// состояние панели (как в админ документах)
const controls = document.getElementById('controls');
const state = {
  sortBy: 'new',      // new | old | name
  filterType: 'all'   // all | PDF | DOC | ...
};

// =========================
// HELPERS: UI + DATA
// =========================
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
  const t = String(doc?.fileType || '').toUpperCase().trim();
  if (t) return t;

  const name = String(doc?.fileName || '');
  const ext = name.includes('.') ? name.split('.').pop() : '';
  return String(ext || '').toUpperCase().trim();
}

function applyClientSortAndFilter(docs) {
  let out = Array.isArray(docs) ? [...docs] : [];

  // filter
  if (state.filterType !== 'all') {
    out = out.filter(d => getDocType(d) === state.filterType);
  }

  // sort
  if (state.sortBy === 'name') {
    out.sort((a, b) =>
      String(a?.name || '').localeCompare(String(b?.name || ''), 'ru')
    );
  } else if (state.sortBy === 'old') {
    out.sort((a, b) => new Date(a?.uploadDate || 0) - new Date(b?.uploadDate || 0));
  } else {
    // new (default)
    out.sort((a, b) => new Date(b?.uploadDate || 0) - new Date(a?.uploadDate || 0));
  }

  return out;
}

// =========================
// LOAD
// =========================
async function loadDocuments() {
  const res = await fetch('/api/documents');
  const documents = await res.json();

  window.__documentsCache = documents;

  // применяем фильтр+сортировку как в админке
  renderDocuments(applyClientSortAndFilter(documents));
}

// =========================
// RENDER (НЕ ЛОМАЕМ твою логику "кнопка/форма первой")
// =========================
function renderDocuments(documents) {
  const openBtn = document.getElementById('open-create-form');
  const form = document.getElementById('create-form');

  // 1) удаляем ТОЛЬКО карточки документов, которые рисуем сами
  grid.querySelectorAll('[data-doc-card="1"]').forEach(el => el.remove());

  // 2) гарантируем, что кнопка находится в НУЖНОЙ сетке
  if (openBtn && openBtn.parentElement !== grid) {
    grid.prepend(openBtn);
  }

  // 3) первый элемент: либо форма, либо кнопка (форма именно на месте кнопки)
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

  // 4) рисуем документы
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

// =========================
// CONTROLS (как в админ документах)
// =========================
if (controls) {
  // выставим дефолты, если в HTML нет правильных active/inactive
  setActive('[data-kind="sort"]', 'data-sort', state.sortBy);
  setActive('[data-kind="filter"]', 'data-filter', state.filterType);

  controls.addEventListener('click', (e) => {
    if (activeMode) return; // блокировка смены сортировки/фильтра во время create/edit

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

// =========================
// DOWNLOAD
// =========================
function downloadFile(fileName) {
  window.location.href = `/download/${fileName}`;
}

// =========================
// DELETE
// =========================
async function deleteDocument(id) {
  if (activeMode) return; // защита от удаления во время редактирования
  if (!confirm('Удаление документа?')) return;

  await fetch(`/api/documents/${id}`, { method: 'DELETE' });
  loadDocuments();
}

// =========================
// EDIT (как было)
// =========================
async function editDocument(id, btn) {
  if (activeMode) return; // блокировка нескольких редактирований
  activeMode = 'edit';

  const card = btn.closest('.document-card');
  const originalHTML = card.innerHTML; // сохранение для отмены

  // получение данных документа
  const res = await fetch(`/api/documents/${id}`);
  const doc = await res.json();

  const shortFilename = doc.fileName.split('-').slice(1).join('-');

  // вставка формы редактирования
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

  // обновление названия при выборе файла
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) {
      fileLabel.textContent = `Выбранный файл: ${fileInput.files[0].name}`;
    }
  });

  const saveBtn = card.querySelector('.document-btn--save');
  const cancelBtn = card.querySelector('.document-btn--cancel');

  // отмена редактирования
  cancelBtn.addEventListener('click', () => {
    card.innerHTML = originalHTML;
    activeMode = null;

    // после отмены редактирования перерисуем по текущему фильтру/сорту
    renderDocuments(applyClientSortAndFilter(window.__documentsCache || []));
  });

  // сохранение изменений
  saveBtn.addEventListener('click', async () => {
    const newName = card.querySelector(`#edit-name-${id}`).value.trim();
    const file = fileInput.files[0];

    if (!newName) {
      alert('Ввод названия документа');
      return;
    }

    // подготовка данных для отправки
    const updateData = {
      name: newName,
      fileName: doc.fileName,
      fileType: doc.fileType,
      filePath: doc.filePath
    };

    // обработка нового файла
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

    // отправка на сервер
    await fetch(`/api/documents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData)
    });

    activeMode = null;
    loadDocuments();
  });
}

// =========================
// CREATE (как было, только после действий — перерисовка с фильтром/сортом)
// =========================
const openBtn = document.getElementById('open-create-form');
const form = document.getElementById('create-form');
const cancelBtn = document.getElementById('cancel-create');

// показ формы создания
if (openBtn && form) {
  openBtn.addEventListener('click', () => {
    if (activeMode) return;

    activeMode = 'create';
    renderDocuments(applyClientSortAndFilter(window.__documentsCache || []));
  });

  // чтобы карточка реагировала и на Enter / Space
  openBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openBtn.click();
    }
  });
}

// скрытие формы создания
if (cancelBtn && form) {
  cancelBtn.addEventListener('click', (e) => {
    // на случай если кнопка внутри form (submit)
    e.preventDefault();

    document.getElementById('new-name').value = '';
    document.getElementById('new-file').value = '';

    activeMode = null;
    renderDocuments(applyClientSortAndFilter(window.__documentsCache || []));
  });
}

// создание документа
document.getElementById('create-btn').addEventListener('click', async (e) => {
  // на случай если кнопка внутри form (submit)
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
    // загрузка файла на сервер
    const uploadRes = await fetch('/upload', {
      method: 'POST',
      body: formData
    });

    if (!uploadRes.ok) {
      throw new Error('Ошибка загрузки файла');
    }

    const uploadData = await uploadRes.json();

    // создание записи о документе
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

    // очистка формы
    document.getElementById('new-name').value = '';
    fileInput.value = '';

    activeMode = null;
    await loadDocuments(); // обновит cache и перерендерит с фильтром/сортом
  } catch (error) {
    console.error('Ошибка создания документа:', error);
    alert('Не удалось создать документ: ' + error.message);
  }
});

// =========================
// INIT
// =========================
loadDocuments();