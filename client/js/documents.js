const grid = document.getElementById('documents-grid');
const sortButtons = document.querySelectorAll('.documents-filters button');

// выделение кнопки "новые" по умолчанию
document.querySelector('.documents-filters button[data-sort="new"]')?.classList.add('active');

let currentSort = 'new';
let activeMode = null; // null, 'create' или 'edit'

// загрузка документов с сервера
async function loadDocuments() {
    let url = '/api/documents';

    if (currentSort !== 'new') {
        url += `?sortBy=${currentSort}`;
    }

    const res = await fetch(url);
    const documents = await res.json();

    renderDocuments(documents);
}

// отрисовка документов
function renderDocuments(documents) {
    grid.innerHTML = '';

    documents.forEach(doc => {
        const card = document.createElement('div');
        card.className = 'document-card';

        // форматирование даты
        const uploadDate = new Date(doc.uploadDate).toLocaleDateString();
        // удаление технической части из имени файла
        const shortFilename = doc.fileName.split('-').slice(1).join('-');

        card.innerHTML = `
            <div class="document-date">${uploadDate}</div>
            <div class="document-name">${doc.name}</div>
            <div class="document-filename">${shortFilename}</div>
            <div class="document-actions-row">
                <button class="document-btn document-btn-primary"
                        onclick="editDocument(${doc.id}, this)">
                    Редактирование
                </button>
                <button class="document-btn document-btn-outline"
                        onclick="deleteDocument(${doc.id})">
                    Удаление
                </button>
            </div>
            <button class="document-btn document-btn-wide"
                    onclick="downloadFile('${doc.fileName}')">
                Скачивание
            </button>
        `;

        grid.appendChild(card);
    });
}

// сортировка документов
sortButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        if (activeMode) return; // блокировка смены сортировки во время редактирования

        sortButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        currentSort = btn.dataset.sort.toLowerCase();
        loadDocuments();
    });
});

// скачивание файла
function downloadFile(fileName) {
    window.location.href = `/download/${fileName}`;
}

// удаление документа
async function deleteDocument(id) {
    if (activeMode) return; // защита от удаления во время редактирования
    if (!confirm('Удаление документа?')) return;

    await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    loadDocuments();
}

// редактирование документа
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

// создание документа
const openBtn = document.getElementById('open-create-form');
const form = document.getElementById('create-form');
const cancelBtn = document.getElementById('cancel-create');

// показ формы создания
if (openBtn && form) {
    openBtn.addEventListener('click', () => {
        if (activeMode) return;

        activeMode = 'create';
        form.style.display = 'flex';
        openBtn.style.display = 'none';

        // добавление формы в сетку при необходимости
        if (!grid.contains(form)) {
            grid.appendChild(form);
        }
    });
}

// скрытие формы создания
if (cancelBtn && form) {
    cancelBtn.addEventListener('click', () => {
        form.style.display = 'none';
        openBtn.style.display = 'inline-block';
        activeMode = null;

        if (grid.contains(form)) {
            grid.removeChild(form);
        }

        // очистка полей
        document.getElementById('new-name').value = '';
        document.getElementById('new-file').value = '';
    });
}

// создание документа
document.getElementById('create-btn').addEventListener('click', async () => {
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

        // скрытие формы
        form.style.display = 'none';
        openBtn.style.display = 'inline-block';

        if (grid.contains(form)) {
            grid.removeChild(form);
        }

        // сброс режима
        activeMode = null;

        // обновление списка
        await loadDocuments();

    } catch (error) {
        console.error('Ошибка создания документа:', error);
        alert('Не удалось создать документ: ' + error.message);
        // сохранение активного режима при ошибке
    }
});

// начальная загрузка документов
loadDocuments();