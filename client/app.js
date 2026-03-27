const dailyMessages = [
    "Сегодня отличный день, чтобы заработать миллион долларов.",
    "Сегодня отличный день, чтобы стать волшебником.",
    "Сегодня отличный день, чтобы напомнить близким, как вы их любите.",
    "Сегодня отличный день, чтобы создать новый химический элемент.",
    "Сегодня отличный день, чтобы работать с хорошим настроением.",
    "Сегодня отличный день, чтобы начать маленькое великое дело.",
    "Сегодня отличный день, чтобы придумать что-то гениальное.",
    "Сегодня отличный день, чтобы научиться чему-то новому.",
    "Сегодня отличный день, чтобы подумать нестандартно.",
    "Сегодня отличный день, чтобы просто быть молодцом.",
    "Сегодня отличный день, чтобы делать всё легко.",
    "Сегодня отличный день, чтобы придумать новый праздник.",
    "Сегодня отличный день, чтобы сделать мир капельку лучше.",
    "Сегодня отличный день, чтобы ничего не откладывать.",
    "Сегодня отличный день, чтобы поймать удачу за хвост.",
    "Сегодня отличный день, чтобы улучшить что-то хотя бы на 1%.",
    "Сегодня отличный день, чтобы улыбнуться.",
    "Сегодня отличный день, чтобы порадовать себя.",
    "Сегодня отличный день, чтобы вспомнить, что всё возможно.",
    "Сегодня отличный день, чтобы удивить самого себя.",
    "Сегодня отличный день, чтобы проявить талант.",
    "Сегодня отличный день, чтобы придумать новую традицию.",
    "Сегодня отличный день, чтобы действовать смело.",
    "Сегодня отличный день, чтобы сделать доброе дело.",
    "Сегодня отличный день, чтобы начать новую игру.",
    "Сегодня отличный день, чтобы создать что-то красивое.",
    "Сегодня отличный день, чтобы чуть-чуть отдохнуть.",
    "Сегодня отличный день, чтобы быть добрее к себе.",
    "Сегодня отличный день, чтобы закончить начатое.",
    "Сегодня отличный день, чтобы начать что-то новое."
];
const API_URL = 'http://localhost:3000/api/tasks';
let currentSort = 'new';
function getRandomMessage() {
    const today = new Date();
    const dayOfMonth = today.getDate();
    const index = dayOfMonth % dailyMessages.length;
    return dailyMessages[index];
}
function loadData() {
    const dailyMessageElement = document.getElementById('daily-message');
    if (dailyMessageElement) {
        dailyMessageElement.textContent = getRandomMessage();
    }
    const announcementElement = document.getElementById('admin-announcement');
    if (announcementElement) {
        console.log('загрузка объявления...');
    }
    const downloadButtons = document.querySelectorAll('.download-button');
    downloadButtons.forEach(button => {
        button.addEventListener('click', function() {
            const fileName = this.getAttribute('data-file') || 'document.pdf';
            downloadFile(fileName);
        });
    });
    const footerLinks = document.querySelectorAll('.footer-nav-button, .privacy-link');
    footerLinks.forEach(link => {
        if (link.href.includes('#')) {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                alert(`переход на страницу: ${this.textContent}`);
            });
        }
    });
    const headerButtons = document.querySelectorAll('.action-button');
    headerButtons.forEach(button => {
        if (button.href.includes('notifications.html') || button.href.includes('profile.html')) {
        } else if (button.href.includes('#')) {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                alert(`нажатие кнопки: ${this.textContent}`);
            });
        }
    });
    loadTasksPreview();
}
async function loadTasksPreview() {
    try {
        const response = await fetch(API_URL, {
            credentials: 'include'
        });
        const tasks = await response.json();
        const tasksPreview = document.getElementById('tasksPreview');
        
        if (tasksPreview) {
            const sortedTasks = tasks.sort((a, b) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const getDaysDiff = (deadline) => {
                    if (!deadline) return Infinity;
                    const deadlineDate = new Date(deadline);
                    deadlineDate.setHours(0, 0, 0, 0);
                    return Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));
                };
                
                const daysDiffA = getDaysDiff(a.deadline);
                const daysDiffB = getDaysDiff(b.deadline);
                if (daysDiffA < daysDiffB) return -1;
                if (daysDiffA > daysDiffB) return 1;
                const priorityOrder = { 'Высокий': 1, 'Средний': 2, 'Низкий': 3 };
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            });
            const topTasks = sortedTasks.slice(0, 3);
            
            if (topTasks.length === 0) {
                tasksPreview.innerHTML = '<p class="errmargin">задачи отсутствуют</p>';
                return;
            }
            tasksPreview.innerHTML = `
                <div class="tasks-container">
                    ${topTasks.map(task => {
                        let daysText = '';
                        if (task.deadline) {
                            const deadlineDate = new Date(task.deadline);
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            deadlineDate.setHours(0, 0, 0, 0);
                            
                            const daysDiff = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));
                            
                            if (daysDiff === 0) daysText = '(сегодня)';
                            else if (daysDiff === 1) daysText = '(завтра)';
                            else if (daysDiff === -1) daysText = '(вчера)';
                            else if (daysDiff < 0) daysText = `(${Math.abs(daysDiff)} дн. назад)`;
                            else daysText = `(${daysDiff} дн.)`;
                        }
                        
                        return `
                            <div class="task-item">
                                <span class="task-bullet"></span>
                                <p class="task-text">${task.title} ${daysText}</p>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }
    } catch (error) {
        console.error('ошибка загрузки задач:', error);
        const tasksPreview = document.getElementById('tasksPreview');
        if (tasksPreview) {
            tasksPreview.innerHTML = '<p class="errmargin">ошибка загрузки</p>';
        }
    }
}
async function loadTasks() {
    try {
        const response = await fetch(`${API_URL}?sortBy=${currentSort}`, {
            credentials: 'include'
        });

        const tasks = await response.json();
        renderTasks(tasks);

    } catch (error) {
        console.error('ошибка загрузки задач:', error);
        alert('неудачная загрузка задач');
    }
}

function markDeadline(card, deadline) {
    if (!deadline) return;

    const today = new Date();
    const deadlineDate = new Date(deadline);

    today.setHours(0, 0, 0, 0);
    deadlineDate.setHours(0, 0, 0, 0);

    const daysDiff = Math.ceil(
        (deadlineDate - today) / (1000 * 60 * 60 * 24)
    );

    if (daysDiff === 0 || daysDiff === 1) {
        card.classList.add('deadline-soon');
    }

    if (daysDiff < 0) {
        card.classList.add('deadline-overdue');
    }
}
function renderTasks(tasks) {
    const tasksGrid = document.getElementById('tasksGrid');
    if (!tasksGrid) return;

    tasksGrid.innerHTML = '';
    const newTaskCard = createTaskCard({}, true);
    tasksGrid.appendChild(newTaskCard);
    tasks.forEach(task => {
        const taskCard = createTaskCard(task, false);
        tasksGrid.appendChild(taskCard);
    });

}
function createTaskCard(task, isNew = false) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.dataset.id = task.id || 'new';

    if (isNew) {
        card.classList.add('new-task-card');
        card.innerHTML = `
            <div class="card-inner new-card-inner">
                <div class="plus-icon">
                    <div class="plus-horizontal"></div>
                    <div class="plus-vertical"></div>
                </div>
                <p class="new-card-text">Добавить новую задачу</p>
            </div>
        `;
    } else {
        const deadlineText = task.deadline 
            ? `до ${new Date(task.deadline).toLocaleDateString('ru-RU')}`
            : 'дедлайн отсутствует';

        card.innerHTML = `
            <div class="card-inner">
                <div class="field-container">
                    <div class="task-field view-mode" data-field="title">${task.title || ''}</div>
                    <input class="task-input required edit-mode" data-field="title" placeholder="Название задачи" 
                           style="display:none;" value="${task.title || ''}">
                </div>
                <div class="field-container">
                    <div class="task-field view-mode description" data-field="description">${task.description || 'Описание отсутствует'}</div>
                    <textarea class="task-input edit-mode" data-field="description" placeholder="Описание задачи (необязательно)"
                              style="display:none;">${task.description || ''}</textarea>
                </div>
                <div class="field-container">
                    <div class="task-field view-mode" data-field="priority">Приоритет: ${task.priority}</div>
                    <select class="task-input edit-mode" data-field="priority" style="display:none;">
                        <option value="" disabled selected style="color: #9CA3AF;">
                            Выберите приоритет
                        </option>
                        <option value="Высокий" ${task.priority === 'Высокий' ? 'selected' : ''}>Высокий</option>
                        <option value="Средний" ${task.priority === 'Средний' ? 'selected' : ''}>Средний</option>
                        <option value="Низкий" ${task.priority === 'Низкий' ? 'selected' : ''}>Низкий</option>
                    </select>
                </div>
                <div class="field-container">
                    <div class="task-field view-mode" data-field="deadline">${deadlineText}</div>
                    <input type="date" class="task-input edit-mode" data-field="deadline" 
                           style="display:none;" value="${task.deadline ? task.deadline.split('T')[0] : ''}">
                </div>
                <div class="card-actions">
                    <button class="action-btn edit-btn">Редактировать</button>
                    <button class="action-btn delete-btn">Удалить</button>
                    <button class="action-btn save-btn" style="display:none;">Сохранить</button>
                    <button class="action-btn cancel-btn" style="display:none;">Отмена</button>
                </div>
            </div>
        `;
        markDeadline(card, task.deadline);
    }

    return card;
}
function setupTaskEvents() {
    const tasksGrid = document.getElementById('tasksGrid');
    const sortButtons = document.querySelectorAll('.sort-btn');
    
    if (tasksGrid) {
        tasksGrid.addEventListener('click', handleTaskCardClick);
    }
    
    if (sortButtons.length > 0) {
        sortButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                sortButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentSort = btn.dataset.sort;
                loadTasks();
            });
        });
    }
}
function handleTaskCardClick(event) {
    const card = event.target.closest('.task-card');
    if (!card) return;

    const taskId = card.dataset.id;
    if (card.classList.contains('new-task-card')) {
        createNewTask(card);
        return;
    }
    if (event.target.classList.contains('edit-btn')) {
        enableEditMode(card);
        return;
    }
    if (event.target.classList.contains('save-btn')) {
        saveTask(taskId, card);
        return;
    }
    if (event.target.classList.contains('cancel-btn')) {
        disableEditMode(card);
        loadTasks();
        return;
    }
    if (event.target.classList.contains('delete-btn')) {
        deleteTask(taskId);
        return;
    }
}

function closeNewTaskCardIfOpen() {
  const tasksGrid = document.getElementById('tasksGrid');
  if (!tasksGrid) return;
  const openNewCard = tasksGrid.querySelector('.task-card[data-id="new"]:not(.new-task-card)');
  if (!openNewCard) return;
  const newTaskTile = createTaskCard({}, true);
  openNewCard.replaceWith(newTaskTile);
}
function enableEditMode(card) {
  closeNewTaskCardIfOpen();

  const tasksGrid = document.getElementById('tasksGrid');
  if (tasksGrid) {
    tasksGrid.querySelectorAll('.task-card').forEach(c => {
      if (c !== card && c.querySelector('.edit-mode')?.style.display === 'block') {
        disableEditMode(c);
      }
    });
  }

  card.querySelector('.card-inner').style.backgroundColor = '#FFFFFF';
  card.querySelectorAll('.view-mode').forEach(el => el.style.display = 'none');
  card.querySelectorAll('.edit-mode').forEach(el => el.style.display = 'block');
  card.querySelector('.edit-btn').style.display = 'none';
  card.querySelector('.delete-btn').style.display = 'none';
  card.querySelector('.save-btn').style.display = 'block';
  card.querySelector('.cancel-btn').style.display = 'block';
}
function disableEditMode(card) {
    card.querySelector('.card-inner').style.backgroundColor = '';
    card.querySelectorAll('.view-mode').forEach(el => el.style.display = 'block');
    card.querySelectorAll('.edit-mode').forEach(el => el.style.display = 'none');
    card.querySelector('.edit-btn').style.display = 'block';
    card.querySelector('.delete-btn').style.display = 'block';
    card.querySelector('.save-btn').style.display = 'none';
    card.querySelector('.cancel-btn').style.display = 'none';
}
function createNewTask(newCardElement) {
    const tempTask = { title: '', description: '', priority: 'Средний', deadline: '' };
    const editCard = createTaskCard(tempTask, false);
    editCard.querySelector('.card-inner').style.backgroundColor = '#FFFFFF';
    enableEditMode(editCard);
    newCardElement.replaceWith(editCard);
}
async function saveTask(taskId, card) {
    const title = card.querySelector('input[data-field="title"]')?.value.trim();
    const description = card.querySelector('textarea[data-field="description"]')?.value.trim();
    const priority = card.querySelector('select[data-field="priority"]')?.value;
    const deadline = card.querySelector('input[data-field="deadline"]')?.value || null;
    if (!title) {
        alert('название задачи обязательно!');
        return;
    }
    if (!priority) {
        alert('выбор приоритета!');
        return;
    }

    const taskData = {
        title,
        description: description || null,
        priority,
        deadline: deadline ? new Date(deadline).toISOString() : null
    };

    try {
        let response;
        if (taskId === 'new') {
            response = await fetch(API_URL, {
                credentials: 'include',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskData)
            });
        } else {
            response = await fetch(`${API_URL}/${taskId}`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskData)
            });

        }

        if (response.ok) {
            loadTasks();
        } else {
            throw new Error('ошибка при сохранении');
        }
    } catch (error) {
        console.error('ошибка сохранения:', error);
        alert('неудачное сохранение задачи');
    }
}
async function deleteTask(taskId) {
    if (!confirm('удаление задачи?')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/${taskId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            loadTasks();
        } else {
            throw new Error('ошибка при удалении');
        }
    } catch (error) {
        console.error('ошибка удаления:', error);
        alert('неудачное удаление задачи');
    }
}
function downloadFile(fileName) {
    const link = document.createElement('a');
    link.href = '#';
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    alert(`начало скачивания файла: ${fileName}\n(в демо-версии файл не загружается)`);
}
function checkResponsive() {
    const width = window.innerWidth;
    const footer = document.querySelector('.footer');
    
    if (width <= 1200 && footer) {
        footer.style.position = 'relative';
    }
}
document.addEventListener('DOMContentLoaded', function() {
    console.log('загрузка страницы. инициализация...');
    
    loadData();
    setupTaskEvents();
    if (window.location.pathname.includes('tasks.html') || window.location.pathname === '/tasks') {
        loadTasks();
    }
    
    checkResponsive();
    window.addEventListener('resize', checkResponsive);
    
    console.log('настройка всех элементов');
});