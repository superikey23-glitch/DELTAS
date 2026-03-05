// index.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const { Sequelize, DataTypes } = require('sequelize');
const { Op } = require('sequelize');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

function getLanUrls(port) {
    const interfaces = os.networkInterfaces();
    const urls = [];

    for (const list of Object.values(interfaces)) {
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            if (!item || item.family !== 'IPv4' || item.internal) continue;
            urls.push(`http://${item.address}:${port}`);
        }
    }

    return urls;
}

const cookieParser = require('cookie-parser');
app.use(cookieParser());

/* =======================
   Middleware
======================= */
app.use(cors({
    credentials: true
}));


app.use(express.json());
app.use('/api', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    next();
});

/* =======================
   Пути
======================= */
const clientPath = path.join(__dirname, '..', 'client');

/* =======================
   Статика
======================= */
const adminPagePaths = [
    '/admin-panel',
    '/admin-panel.html',
    '/admin_announcement',
    '/admin_announcement.html',
    '/admin_documents',
    '/admin_documents.html',
    '/admin_notify',
    '/admin_notify.html',
    '/admin_profiles',
    '/admin_profiles.html'
];

async function checkAdminPageAccess(req, res, next) {
    const token = req.cookies?.token;

    if (!token) {
        return res.redirect('/login');
    }

    const session = await Session.findOne({
        where: {
            token,
            expiresAt: { [Op.gt]: new Date() }
        },
        include: User
    });

    if (!session) {
        res.clearCookie('token');
        return res.redirect('/login');
    }

    if (session.User.role !== 'admin') {
        res.status(403);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Доступ запрещен</title>
</head>
<body>
  <script>
    alert('У вас недостаточно прав');
    window.location.replace('/');
  </script>
</body>
</html>`);
    }

    req.user = {
        id: session.User.id,
        username: session.User.username,
        role: session.User.role
    };

    next();
}

app.use(adminPagePaths, checkAdminPageAccess);
app.use(express.static(clientPath));

/* =======================
   База данных
======================= */
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, '..', 'database.db'),
    logging: false
});

/* =======================
   Модели БД
======================= */

// Модель User
const User = sequelize.define('User', {
    fullname: {
        type: 
        DataTypes.STRING,
        allowNull: false,
        unique: false
    },
    phone: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    position: {
        type: DataTypes.STRING,
        allowNull: false        
    },
    username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    role: {
        type: DataTypes.STRING,
        allowNull: false
    }
}, {
    timestamps: true
});

const Task = sequelize.define('Task', {
  title: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  priority: { type: DataTypes.STRING, defaultValue: 'Средний' },
  deadline: { type: DataTypes.DATE, allowNull: true },

  userId: { type: DataTypes.INTEGER, allowNull: false } // ← ВАЖНО
}, {
  timestamps: true
});

// связь
Task.belongsTo(User, { foreignKey: 'userId', onDelete: 'CASCADE' });
User.hasMany(Task, { foreignKey: 'userId' });

const Document = sequelize.define('Document', {
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    fileName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    fileType: {
        type: DataTypes.STRING,
        allowNull: false
    },
    uploadDate: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.NOW
    },
    filePath: {
        type: DataTypes.STRING,
        allowNull: false
    }
}, {
    timestamps: true
});

const Session = sequelize.define('Session', {
    token: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: false
    }
});

Session.belongsTo(User);
User.hasMany(Session);

Document.belongsTo(User, { foreignKey: 'userId', onDelete: 'SET NULL' });
User.hasMany(Document, { foreignKey: 'userId' });




// Генерация токена
function generateToken() {
    return 'token_' + Math.random().toString(36).substr(2) + Date.now().toString(36);
}

// Middleware для проверки аутентификации
async function requireAuth(req, res, next) {
    const token = req.cookies?.token;

    if (!token) {
        return res.status(401).json({ error: 'Требуется аутентификация' });
    }

    const session = await Session.findOne({
        where: {
            token,
            expiresAt: { [Op.gt]: new Date() }
        },
        include: User
    });

    if (!session) {
        res.clearCookie('token');
        return res.status(401).json({ error: 'Сессия истекла' });
    }

    req.user = {
        id: session.User.id,
        username: session.User.username,
        role: session.User.role
    };

    next();
}



// Middleware для проверки ролей
function requireRole(role) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Требуется аутентификация' });
        }
        
        if (req.user.role !== role && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }
        
        next();
    };
}

/* =======================
   Функция создания пользователей по умолчанию
======================= */
async function createDefaultUsers() {
    const exists = await User.findOne({ where: { username: '123' } });
    if (exists) return;

    await User.create({
        fullname: 'Ботвиновский Игорь Николаевич',
        phone: '+79873414633',
        email: 'Igorbot2007@mail.ru',
        position: 'Веб-разработчик (стажёр)',
        role: 'admin',
        username: '123',
        password: bcrypt.hashSync('123', 10)
    });


    console.log('✅ Создан основной пользователь');
}

/* =======================
   Загрузка файлов
======================= */
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'client', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const originalNameUtf8 =
            Buffer.from(file.originalname, 'latin1').toString('utf8');

        const uniqueName = Date.now() + '-' + originalNameUtf8;
        cb(null, uniqueName);
    }

});

const upload = multer({ storage: storage });

/* =======================
   API для аутентификации
======================= */
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Логин и пароль обязательны' });
        }

        const user = await User.findOne({ where: { username } });
        if (!user) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        const validPassword = bcrypt.compareSync(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        // ✅ ГЕНЕРАЦИЯ ТОКЕНА (ОБЯЗАТЕЛЬНО)
        const token = generateToken();
        const SESSION_LIFETIME = 30 * 24 * 60 * 60 * 1000;

        // ✅ ОДНА сессия, корректная
        const expiresAt = new Date(Date.now() + SESSION_LIFETIME);

        await Session.create({
            token,
            UserId: user.id,
            expiresAt
        });


        res.cookie('token', token, {
            httpOnly: true,
            maxAge: SESSION_LIFETIME,
            sameSite: 'lax',
            secure: false
        });

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Выход из системы
app.post('/api/logout', requireAuth, async (req, res) => {
    await Session.destroy({ where: { token: req.token } });
    res.clearCookie('token');
    res.json({ success: true });
});


// Проверка текущего пользователя
app.get('/api/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
});
app.get('/api/profile', requireAuth, async (req, res) => {
    const user = await User.findByPk(req.user.id, {
        attributes: { exclude: ['password'] }
    });
    res.json(user);
});
app.get('/profile', (req, res) => {
    res.sendFile(path.join(clientPath, 'profile.html'));
});


// Получение всех пользователей (только для админов)
// Получение всех пользователей (только для админов) — ПОЛНЫЕ ПОЛЯ
// app.get('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
//   try {
//     const users = await User.findAll({
//       attributes: ['id', 'fullname', 'email', 'phone', 'position', 'role', 'username'],
//       order: [['id', 'ASC']]
//     });

//     res.json(users);
//   } catch (e) {
//     console.error(e);
//     res.status(500).json({ error: 'Ошибка загрузки пользователей' });
//   }
// });


// // Создание нового пользователя (только для админов)
// app.post('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
//   try {
//     const { fullname, email, phone, position, role, username, password } = req.body;

//     if (!fullname || !email || !phone || !position || !role || !username || !password) {
//       return res.status(400).json({ error: 'Заполни все поля' });
//     }

//     const existing = await User.findOne({ where: { username } });
//     if (existing) {
//       return res.status(400).json({ error: 'Логин уже занят' });
//     }

//     const hashedPassword = bcrypt.hashSync(password, 10); // у тебя bcryptjs

//     const user = await User.create({
//       fullname,
//       email,
//       phone,
//       position,
//       role,
//       username,
//       password: hashedPassword
//     });

//     res.status(201).json({
//       id: user.id,
//       fullname: user.fullname,
//       email: user.email,
//       phone: user.phone,
//       position: user.position,
//       role: user.role,
//       username: user.username
//     });
//   } catch (error) {
//     console.error('Ошибка создания пользователя:', error);
//     res.status(500).json({ error: 'Ошибка создания пользователя' });
//   }
// });

/* =======================
   API для задач (требуется аутентификация)
======================= */
app.get('/api/tasks', requireAuth, async (req, res) => {
  const { sortBy } = req.query;

  let order = [['createdAt', 'DESC']];
  if (sortBy === 'old') order = [['createdAt', 'ASC']];
  if (sortBy === 'deadline') order = [['deadline', 'ASC']];
  if (sortBy === 'priority') {
    order = [[
      sequelize.literal(`
        CASE priority
          WHEN 'Высокий' THEN 3
          WHEN 'Средний' THEN 2
          WHEN 'Низкий' THEN 1
          ELSE 0
        END
      `),
      'DESC'
    ]];
  }

  const where = { userId: req.user.id };

  const tasks = await Task.findAll({ where, order });
  res.json(tasks);
});

app.post('/api/tasks', requireAuth, async (req, res) => {
  try {
    const task = await Task.create({
      ...req.body,
      userId: req.user.id
    });
    res.status(201).json(task);
  } catch (e) {
    res.status(400).json({ error: 'Ошибка создания задачи' });
  }
});

app.put('/api/tasks/:id', requireAuth, async (req, res) => {
  const task = await Task.findByPk(req.params.id);
  if (!task) return res.status(404).json({ error: 'Задача не найдена' });

  // владелец или админ
  if (req.user.role !== 'admin' && task.userId !== req.user.id) {
    return res.status(403).json({ error: 'Доступ запрещен' });
  }

  await task.update(req.body);
  res.json(task);
});

app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  const task = await Task.findByPk(req.params.id);
  if (!task) return res.status(404).json({ error: 'Задача не найдена' });

  if (req.user.role !== 'admin' && task.userId !== req.user.id) {
    return res.status(403).json({ error: 'Доступ запрещен' });
  }

  await task.destroy();
  res.json({ success: true });
});


function resolveUploadPathSafe(filePath) {
  const clientRoot = path.join(__dirname, '..', 'client');
  const uploadsRoot = path.join(clientRoot, 'uploads');

  const fullPath = path.normalize(path.join(clientRoot, filePath || ''));

  // защита от выхода за uploads (на всякий случай)
  const uploadsRootWithSep = uploadsRoot.endsWith(path.sep) ? uploadsRoot : uploadsRoot + path.sep;
  if (!fullPath.startsWith(uploadsRootWithSep) && fullPath !== uploadsRoot) {
    return null;
  }

  return fullPath;
}

/* =======================
   API для документов (требуется аутентификация)
======================= */

// Загрузка файла
app.post('/upload', requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Файл не загружен' });
    }
    res.json({ fileName: req.file.filename });
});

app.get('/download/:fileName', requireAuth, async (req, res) => {
  try {
    const fileName = req.params.fileName;

    const doc = await Document.findOne({ where: { fileName } });
    if (!doc) return res.status(404).json({ error: 'Файл не найден' });

    if (req.user.role !== 'admin' && doc.userId !== req.user.id) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    const filePath = path.join(__dirname, '..', 'client', doc.filePath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Файл не найден' });

    res.download(filePath, doc.fileName);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка скачивания' });
  }
});

// Получение документа по ID
app.get('/api/documents/:id', requireAuth, async (req, res) => {
  const where = { id: Number(req.params.id) };

  if (req.user.role !== 'admin') {
    where.userId = req.user.id;
  }

  const document = await Document.findOne({ where });

  if (!document) {
    return res.status(404).json({ error: 'Документ не найден' });
  }

  res.json(document);
});

// Получение всех документов с сортировкой
app.get('/api/documents', requireAuth, async (req, res) => {
  try {
    const { sortBy } = req.query;

    let order = [['createdAt', 'DESC']];

    if (sortBy === 'name') order = [['name', 'ASC']];

    if (['pdf', 'doc', 'docx', 'xls', 'png', 'jpeg'].includes(sortBy)) {
      order = [
        [sequelize.literal(`
          CASE
            WHEN fileType = '${sortBy.toUpperCase()}' THEN 0
            WHEN fileType = 'DOC'  THEN 1
            WHEN fileType = 'DOCX' THEN 2
            WHEN fileType = 'PDF'  THEN 3
            WHEN fileType = 'XLS'  THEN 4
            WHEN fileType = 'PNG'  THEN 5
            WHEN fileType = 'JPEG' THEN 6
            ELSE 7
          END
        `), 'ASC'],
        ['createdAt', 'DESC']
      ];
    }

   const where = { userId: req.user.id };

    const documents = await Document.findAll({ where, order });
    res.json(documents);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'Ошибка получения документов' });
  }
});


// Создание документа с поддержкой кириллицы - пока уберем
// app.post('/api/documents', requireAuth, async (req, res) => {
//     try {
//         // Берём данные из формы
//         let { name, fileName, fileType, filePath } = req.body;

//         // Обеспечиваем корректную кодировку UTF-8
//         if (typeof name === 'string') {
//             name = name.trim(); // убираем лишние пробелы
//             name = name.normalize('NFC'); // нормализуем Unicode
//         }

//         if (typeof fileName === 'string') {
//             fileName = fileName.trim();
//             fileName = fileName.normalize('NFC');
//         }

//         // Создаём запись в базе
//         const document = await Document.create({
//             name,
//             fileName,
//             fileType,
//             filePath,
//             uploadDate: new Date()
//         });

//         res.status(201).json(document);
//     } catch (e) {
//         console.error(e);
//         res.status(400).json({ error: 'Ошибка создания документа' });
//     }
// });

// Обновление документа
app.put('/api/documents/:id', requireAuth, async (req, res) => {
  const where = { id: Number(req.params.id) };

  if (req.user.role !== 'admin') {
    where.userId = req.user.id;
  }

  const document = await Document.findOne({ where });

  if (!document) {
    return res.status(404).json({ error: 'Документ не найден' });
  }

  await document.update(req.body);
  res.json(document);
});

// Удаление документа
// Удаление документа + физического файла
app.delete('/api/documents/:id', requireAuth, async (req, res) => {
  const where = { id: Number(req.params.id) };

  if (req.user.role !== 'admin') {
    where.userId = req.user.id;
  }

  const document = await Document.findOne({ where });

  if (!document) {
    return res.status(404).json({ error: 'Документ не найден' });
  }

  // 1) удаляем файл с диска (если он есть)
  const fullPath = resolveUploadPathSafe(document.filePath);

  if (fullPath) {
    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (e) {
      // если файл уже удалён — ок, иначе логируем и продолжаем
      if (e?.code !== 'ENOENT') {
        console.error('Ошибка удаления файла:', e);
      }
    }
  } else {
    console.warn('Подозрительный filePath, пропускаю удаление файла:', document.filePath);
  }

  // 2) удаляем запись из БД
  await document.destroy();

  res.json({ success: true });
});
/* =======================
   Страницы (с проверкой аутентификации)
======================= */

// Middleware для проверки аутентификации на страницах
async function checkPageAuth(req, res, next) {
    if (req.path === '/login') {
        return next();
    }

    const token = req.cookies?.token;
    if (!token) {
        return res.redirect('/login');
    }

    const session = await Session.findOne({
        where: {
            token,
            expiresAt: { [Op.gt]: new Date() }
        },
        include: User
    });

    if (!session) {
        res.clearCookie('token');
        return res.redirect('/login');
    }

    req.user = {
        id: session.User.id,
        username: session.User.username,
        role: session.User.role
    };

    next();
}


// Применяем middleware ко всем страницам
app.use(['/tasks', '/documents', '/profile'], checkPageAuth);

app.get('/', (req, res) => {
    if (req.user) {
        // Если пользователь авторизован, показываем главную страницу
        res.sendFile(path.join(clientPath, 'index.html'));
    } else {
        // Иначе перенаправляем на логин
        res.redirect('/login');
    }
});

app.get('/tasks', (req, res) => {
    res.sendFile(path.join(clientPath, 'tasks.html'));
});

app.get('/documents', (req, res) => {
    res.sendFile(path.join(clientPath, 'documents.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(clientPath, 'join.html'));
});







/* =======================
   УВЕДОМЛЕНИЯ (персональные)
   ВСТАВЬ В index.js одним блоком.
   Требования: у тебя уже есть sequelize, DataTypes, app, User, requireAuth, requireRole.
   TODO: добавить пагинацию по необходимости
======================= */

// ===== MODEL =====
const Notification = sequelize.define('Notification', {
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  timestamps: true // createdAt/updatedAt
});

// связь с пользователем
Notification.belongsTo(User, { foreignKey: 'userId', onDelete: 'CASCADE' });
User.hasMany(Notification, { foreignKey: 'userId' });

// ===== ROUTES =====

// 0) Админ: список пользователей (чтобы выбрать "кому")
app.get('/api/admin/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'fullname', 'username', 'role'],
      order: [['id', 'ASC']]
    });
    res.json(users);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка получения пользователей' });
  }
});

// 1) Получить уведомления (только свои)
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const order = (req.query.order === 'old') ? 'ASC' : 'DESC';

    const rows = await Notification.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', order]]
    });

    // формат под фронт (как в notifications.html)
    res.json(rows.map(n => ({
      id: n.id,
      title: n.title,
      body: n.body,
      is_read: n.isRead ? 1 : 0,
      created_at: n.createdAt
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка получения уведомлений' });
  }
});

// 2) Пометить как прочитанное (только своё)
app.post('/api/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Некорректный id' });

    const notif = await Notification.findOne({
      where: { id, userId: req.user.id }
    });

    if (!notif) return res.status(404).json({ error: 'Не найдено' });

    notif.isRead = true;
    await notif.save();

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка обновления уведомления' });
  }
});

// 3) Удалить уведомление (только своё)
app.delete('/api/notifications/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Некорректный id' });

    const deleted = await Notification.destroy({
      where: { id, userId: req.user.id }
    });

    if (!deleted) return res.status(404).json({ error: 'Не найдено' });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка удаления уведомления' });
  }
});

// 4) Админ: отправить уведомление конкретному пользователю
app.post('/api/admin/notifications', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const userId = Number(req.body.userId);
    const title = String(req.body.title || '').trim();
    const body = String(req.body.body || '').trim();

    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Нужен корректный userId' });
    }
    if (!title || !body) {
      return res.status(400).json({ error: 'Нужны title и body' });
    }
    

    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const created = await Notification.create({
      title,
      body,
      userId,
      isRead: false
    });

    res.json({ ok: true, id: created.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка создания уведомления' });
  }
});

/* =======================
   КОНЕЦ БЛОКА УВЕДОМЛЕНИЙ
======================= */




/* =======================
   ОБЪЯВЛЕНИЕ (одно на весь портал)
======================= */

// MODEL
const Announcement = sequelize.define('Announcement', {
  text: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: ''
  }
}, {
  timestamps: true
});

// helper: гарантируем одну запись (id=1)
async function ensureAnnouncementRow() {
  const row = await Announcement.findByPk(1);
  if (!row) {
    await Announcement.create({ id: 1, text: '' });
  }
}

// API: получить объявление (любой авторизованный)
app.get('/api/announcement', requireAuth, async (req, res) => {
  try {
    await ensureAnnouncementRow();
    const row = await Announcement.findByPk(1);
    res.json({ text: row?.text || '' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка получения объявления' });
  }
});

// API: изменить объявление (только админ)
app.put('/api/admin/announcement', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await ensureAnnouncementRow();
    const text = String(req.body.text || '').trim();

    const row = await Announcement.findByPk(1);
    row.text = text;
    await row.save();

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сохранения объявления' });
  }
});

/* =======================
   СТРАНИЦА админ-редактирования
======================= */

// защита страницы (добавь в список)
app.use(['/tasks', '/documents', '/profile', '/admin_announcement'], checkPageAuth);

// раздача страницы
app.get('/admin_announcement', (req, res) => {
  res.sendFile(path.join(clientPath, 'admin_announcement.html'));
});



// ===== Admin Documents Page =====
app.use(['/admin_documents'], checkPageAuth);

app.get('/admin_documents', (req, res) => {
  res.sendFile(path.join(clientPath, 'admin_documents.html'));
});


// Скачать документ по id
app.get('/api/admin/documents/:id/download', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const doc = await Document.findByPk(req.params.id);
    if (!doc) return res.status(404).send('Not found');

    // filePath у тебя хранится как строка (скорее всего "uploads/xxx")
    const fullPath = path.join(__dirname, '..', 'client', doc.filePath);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    res.download(fullPath, doc.fileName);
  } catch (e) {
    console.error(e);
    res.status(500).send('Ошибка скачивания');
  }
});


/* =======================
   ДОКУМЕНТЫ (АДМИН)
   - владелец документа
   - админская страница и API
   Требует: app, path, clientPath, sequelize, DataTypes, User, Document, requireAuth, requireRole, checkPageAuth
======================= */

/* 1) Связь Document -> User (владелец) */
if (!Document.rawAttributes.userId) {
  Document.userId = undefined; // просто маркер, не трогаем модель напрямую
}

// Добавляем foreignKey userId через ассоциацию
// Document.belongsTo(User, { foreignKey: 'userId', onDelete: 'SET NULL' });
// User.hasMany(Document, { foreignKey: 'userId' });

/* 2) Патчим создание документа: сохраняем владельца
   (это твой существующий роут /api/documents — просто добавь userId в Document.create)
   Сейчас у тебя Document.create({ name, fileName, fileType, filePath, uploadDate }) :contentReference[oaicite:3]{index=3}
*/
app.post('/api/documents', requireAuth, async (req, res) => {
  try {
    let { name, fileName, fileType, filePath } = req.body;

    if (typeof name === 'string') {
      name = name.trim();
      name = name.normalize('NFC');
    }
    if (typeof fileName === 'string') {
      fileName = fileName.trim();
      fileName = fileName.normalize('NFC');
    }

    const document = await Document.create({
      name,
      fileName,
      fileType,
      filePath,
      uploadDate: new Date(),
      userId: req.user.id
    });

    res.status(201).json(document);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'Ошибка создания документа' });
  }
});

/* 3) Админ-страница */
app.use(['/admin_documents'], checkPageAuth);

app.get('/admin_documents', (req, res) => {
  res.sendFile(path.join(clientPath, 'admin_documents.html'));
});

/* 4) Админ-API: все документы + владелец + сортировка/фильтр */
app.get('/api/admin/documents', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const sortBy = String(req.query.sortBy || 'new').toLowerCase();
    const type = String(req.query.type || '').toUpperCase().trim();

    const where = {};
    if (type && type !== 'ALL') where.fileType = type;

    let order = [['createdAt', 'DESC']];

    if (sortBy === 'old') order = [['createdAt', 'ASC']];
    if (sortBy === 'name') order = [['name', 'ASC']];

    const rows = await Document.findAll({
      where,
      include: [{
        model: User,
        attributes: ['username', 'fullname'],
        required: false
      }],
      order
    });

    res.json(rows.map(d => ({
      id: d.id,
      name: d.name,
      fileName: d.fileName,
      fileType: d.fileType,
      uploadDate: d.uploadDate,
      createdAt: d.createdAt,
      ownerName: d.User?.fullname || d.User?.username || '—',
      ownerUsername: d.User?.username || ''
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка получения документов' });
  }
});

/* =======================
   КОНЕЦ БЛОКА
======================= */

// ===== USERS (ADMIN) =====
// ===== USERS (ADMIN) =====

// Отдать полный список пользователей (без пароля)
app.get("/api/users", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ["id", "fullname", "email", "phone", "position", "role", "username"],
      order: [["id", "ASC"]],
    });
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка загрузки пользователей" });
  }
});

// Создание пользователя
app.post("/api/users", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const fullname = String(req.body?.fullname ?? "").trim();
    const email = String(req.body?.email ?? "").trim();
    const phone = String(req.body?.phone ?? "").trim();
    const position = String(req.body?.position ?? "").trim();
    const role = String(req.body?.role ?? "").trim();
    const username = String(req.body?.username ?? "").trim();
    const password = String(req.body?.password ?? "");

    if (!fullname || !email || !phone || !position || !role || !username || !password) {
      return res.status(400).json({ error: "Заполни все поля" });
    }

    const conflict = await User.findOne({
      where: { [Op.or]: [{ username }, { email }, { phone }] },
      attributes: ["id", "username", "email", "phone"],
    });

    if (conflict) {
      if (conflict.username === username) return res.status(400).json({ error: "Логин уже занят" });
      if (conflict.email === email) return res.status(400).json({ error: "Email уже занят" });
      if (conflict.phone === phone) return res.status(400).json({ error: "Телефон уже занят" });
      return res.status(400).json({ error: "Пользователь с такими данными уже существует" });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    const user = await User.create({
      fullname,
      email,
      phone,
      position,
      role,
      username,
      password: hashedPassword,
    });

    res.status(201).json({
      id: user.id,
      fullname: user.fullname,
      email: user.email,
      phone: user.phone,
      position: user.position,
      role: user.role,
      username: user.username,
    });
  } catch (err) {
    if (err?.name === "SequelizeUniqueConstraintError") {
      const paths = Array.isArray(err.errors) ? err.errors.map((e) => e.path).filter(Boolean) : [];
      const set = new Set(paths);
      if (set.has("username")) return res.status(400).json({ error: "Логин уже занят" });
      if (set.has("email")) return res.status(400).json({ error: "Email уже занят" });
      if (set.has("phone")) return res.status(400).json({ error: "Телефон уже занят" });
      return res.status(400).json({ error: "Поля должны быть уникальными" });
    }
    console.error("Ошибка создания пользователя:", err);
    res.status(500).json({ error: "Ошибка создания пользователя" });
  }
});

// Редактирование пользователя
// Пароль меняется только если передан
app.put("/api/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: "Пользователь не найден" });

    const { fullname, email, phone, position, role, username, password } = req.body;

    const nextFullname = fullname !== undefined ? String(fullname).trim() : undefined;
    const nextEmail = email !== undefined ? String(email).trim() : undefined;
    const nextPhone = phone !== undefined ? String(phone).trim() : undefined;
    const nextPosition = position !== undefined ? String(position).trim() : undefined;
    const nextRole = role !== undefined ? String(role).trim() : undefined;
    const nextUsername = username !== undefined ? String(username).trim() : undefined;

    if (nextFullname !== undefined && !nextFullname) return res.status(400).json({ error: "ФИО обязательно" });
    if (nextEmail !== undefined && !nextEmail) return res.status(400).json({ error: "Email обязателен" });
    if (nextPhone !== undefined && !nextPhone) return res.status(400).json({ error: "Телефон обязателен" });
    if (nextPosition !== undefined && !nextPosition) return res.status(400).json({ error: "Должность обязательна" });
    if (nextRole !== undefined && !nextRole) return res.status(400).json({ error: "Роль обязательна" });
    if (nextUsername !== undefined && !nextUsername) return res.status(400).json({ error: "Логин обязателен" });

    if (nextUsername !== undefined || nextEmail !== undefined || nextPhone !== undefined) {
      const conflict = await User.findOne({
        where: {
          id: { [Op.ne]: id },
          [Op.or]: [
            ...(nextUsername !== undefined ? [{ username: nextUsername }] : []),
            ...(nextEmail !== undefined ? [{ email: nextEmail }] : []),
            ...(nextPhone !== undefined ? [{ phone: nextPhone }] : []),
          ],
        },
        attributes: ["id", "username", "email", "phone"],
      });

      if (conflict) {
        if (nextUsername !== undefined && conflict.username === nextUsername) {
          return res.status(400).json({ error: "Логин уже занят" });
        }
        if (nextEmail !== undefined && conflict.email === nextEmail) {
          return res.status(400).json({ error: "Email уже занят" });
        }
        if (nextPhone !== undefined && conflict.phone === nextPhone) {
          return res.status(400).json({ error: "Телефон уже занят" });
        }
        return res.status(400).json({ error: "Пользователь с такими данными уже существует" });
      }
    }

    if (nextFullname !== undefined) user.fullname = nextFullname;
    if (nextEmail !== undefined) user.email = nextEmail;
    if (nextPhone !== undefined) user.phone = nextPhone;
    if (nextPosition !== undefined) user.position = nextPosition;
    if (nextRole !== undefined) user.role = nextRole;
    if (nextUsername !== undefined) user.username = nextUsername;

    if (password !== undefined) {
      const nextPassword = String(password);
      if (!nextPassword) return res.status(400).json({ error: "Пароль не может быть пустым" });
      const hashedPassword = bcrypt.hashSync(nextPassword, 10);
      user.password = hashedPassword;
    }

    await user.save();

    res.json({
      id: user.id,
      fullname: user.fullname,
      email: user.email,
      phone: user.phone,
      position: user.position,
      role: user.role,
      username: user.username,
    });
  } catch (err) {
    if (err?.name === "SequelizeUniqueConstraintError") {
      const paths = Array.isArray(err.errors) ? err.errors.map((e) => e.path).filter(Boolean) : [];
      const set = new Set(paths);
      if (set.has("username")) return res.status(400).json({ error: "Логин уже занят" });
      if (set.has("email")) return res.status(400).json({ error: "Email уже занят" });
      if (set.has("phone")) return res.status(400).json({ error: "Телефон уже занят" });
      return res.status(400).json({ error: "Поля должны быть уникальными" });
    }
    console.error("Ошибка обновления пользователя:", err);
    res.status(500).json({ error: "Ошибка обновления пользователя" });
  }
});

// Удаление пользователя
app.delete("/api/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: "Пользователь не найден" });

    await user.destroy();
    res.json({ ok: true });
  } catch (err) {
    console.error("Ошибка удаления пользователя:", err);
    res.status(500).json({ error: "Ошибка удаления пользователя" });
  }
});

/* =======================
   404
======================= */
app.use((req, res) => {
    res.status(404).json({ error: 'Маршрут не найден' });
});









/* =======================
   Синхронизация БД и запуск сервера 0000 
======================= */
sequelize.sync({ force: false }) 
    .then(async () => {
        console.log('✅ База данных синхронизирована');
        
        // Создаем пользователей по умолчанию
        await createDefaultUsers();
        
        // Запускаем сервер
        app.listen(PORT, HOST, () => {
            console.log(`Сервер готов http://localhost:${PORT}`);

            const lanUrls = getLanUrls(PORT);
            if (lanUrls.length > 0) {
                console.log('Подключение с телефона (одна Wi-Fi сеть):');
                lanUrls.forEach((url) => console.log(`- ${url}`));
            } else {
                console.log('LAN адрес не найден. Проверь подключение к сети.');
            }
        });
    })
    .catch(err => {
        console.error('❌ Ошибка синхронизации БД:', err);
        process.exit(1);
    });
