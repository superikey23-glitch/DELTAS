// index.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { Pool } = require('pg');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'portal_db'
});

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

/* =======================
   DB helpers
======================= */
function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    fullname: row.fullname,
    phone: row.phone,
    email: row.email,
    position: row.position,
    username: row.username,
    password: row.password,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    deadline: row.deadline,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    fileName: row.file_name,
    fileType: row.file_type,
    uploadDate: row.upload_date,
    filePath: row.file_path,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    token: row.token,
    expiresAt: row.expires_at,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    isRead: row.is_read,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAnnouncement(row) {
  if (!row) return null;
  return {
    id: row.id,
    text: row.text,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function query(text, params = []) {
  return pool.query(text, params);
}

async function getUserById(id) {
  const { rows } = await query(`SELECT * FROM users WHERE id = $1`, [id]);
  return mapUser(rows[0]);
}

async function getUserByUsername(username) {
  const { rows } = await query(`SELECT * FROM users WHERE username = $1`, [username]);
  return mapUser(rows[0]);
}

async function getSessionWithUser(token) {
  const { rows } = await query(
    `
    SELECT
      s.id AS session_id,
      s.token,
      s.expires_at,
      s.user_id,
      s.created_at AS session_created_at,
      s.updated_at AS session_updated_at,
      u.id,
      u.fullname,
      u.phone,
      u.email,
      u.position,
      u.username,
      u.password,
      u.role,
      u.created_at,
      u.updated_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = $1 AND s.expires_at > NOW()
    LIMIT 1
    `,
    [token]
  );

  if (!rows[0]) return null;

  return {
    id: rows[0].session_id,
    token: rows[0].token,
    expiresAt: rows[0].expires_at,
    userId: rows[0].user_id,
    User: mapUser(rows[0])
  };
}

/* =======================
   Auth helpers
======================= */
async function checkAdminPageAccess(req, res, next) {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.redirect('/login');
    }

    const session = await getSessionWithUser(token);

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
  } catch (error) {
    console.error('Ошибка проверки доступа к админ-странице:', error);
    res.redirect('/login');
  }
}

app.use(adminPagePaths, checkAdminPageAccess);
app.use(express.static(clientPath));

// Генерация токена
function generateToken() {
  return 'token_' + Math.random().toString(36).substr(2) + Date.now().toString(36);
}

// Middleware для проверки аутентификации
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({ error: 'Требуется аутентификация' });
    }

    const session = await getSessionWithUser(token);

    if (!session) {
      res.clearCookie('token');
      return res.status(401).json({ error: 'Сессия истекла' });
    }

    req.token = token;
    req.user = {
      id: session.User.id,
      username: session.User.username,
      role: session.User.role
    };

    next();
  } catch (error) {
    console.error('Ошибка аутентификации:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
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
   DB init
======================= */
async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      fullname TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      position TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NULL,
      priority TEXT NOT NULL DEFAULT 'Средний',
      deadline TIMESTAMPTZ NULL,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS documents (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      upload_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      file_path TEXT NOT NULL,
      user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id BIGSERIAL PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id BIGINT PRIMARY KEY,
      text TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

/* =======================
   Функция создания пользователей по умолчанию
======================= */
async function createDefaultUsers() {
  const user = await getUserByUsername('123');
  if (user) return;

  await query(
    `
    INSERT INTO users (
      fullname, phone, email, position, role, username, password, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    `,
    [
      'Ботвиновский Игорь Николаевич',
      '+79873414633',
      'Igorbot2007@mail.ru',
      'Веб-разработчик (стажёр)',
      'admin',
      '123',
      bcrypt.hashSync('123', 10)
    ]
  );

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

const upload = multer({ storage });

/* =======================
   API для аутентификации
======================= */
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }

    const user = await getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const token = generateToken();
    const SESSION_LIFETIME = 30 * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME);

    await query(
      `
      INSERT INTO sessions (token, user_id, expires_at, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      `,
      [token, user.id, expiresAt]
    );

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
  try {
    await query(`DELETE FROM sessions WHERE token = $1`, [req.token]);
    res.clearCookie('token');
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка выхода:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Проверка текущего пользователя
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/profile', requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const { password, ...safeUser } = user;
    res.json(safeUser);
  } catch (error) {
    console.error('Ошибка профиля:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/profile', (req, res) => {
  res.sendFile(path.join(clientPath, 'profile.html'));
});

/* =======================
   API для задач (требуется аутентификация)
======================= */
app.get('/api/tasks', requireAuth, async (req, res) => {
  try {
    const { sortBy } = req.query;

    let orderSql = `ORDER BY created_at DESC`;
    if (sortBy === 'old') orderSql = `ORDER BY created_at ASC`;
    if (sortBy === 'deadline') orderSql = `ORDER BY deadline ASC NULLS LAST`;
    if (sortBy === 'priority') {
      orderSql = `
        ORDER BY
          CASE priority
            WHEN 'Высокий' THEN 3
            WHEN 'Средний' THEN 2
            WHEN 'Низкий' THEN 1
            ELSE 0
          END DESC
      `;
    }

    const { rows } = await query(
      `
      SELECT * FROM tasks
      WHERE user_id = $1
      ${orderSql}
      `,
      [req.user.id]
    );

    res.json(rows.map(mapTask));
  } catch (error) {
    console.error('Ошибка получения задач:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/tasks', requireAuth, async (req, res) => {
  try {
    const title = req.body?.title;
    const description = req.body?.description ?? null;
    const priority = req.body?.priority ?? 'Средний';
    const deadline = req.body?.deadline ?? null;

    const { rows } = await query(
      `
      INSERT INTO tasks (title, description, priority, deadline, user_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING *
      `,
      [title, description, priority, deadline, req.user.id]
    );

    res.status(201).json(mapTask(rows[0]));
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'Ошибка создания задачи' });
  }
});

app.put('/api/tasks/:id', requireAuth, async (req, res) => {
  try {
    const { rows: foundRows } = await query(
      `SELECT * FROM tasks WHERE id = $1 LIMIT 1`,
      [req.params.id]
    );

    const task = mapTask(foundRows[0]);
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });

    if (req.user.role !== 'admin' && task.userId !== req.user.id) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    const nextTitle = req.body.title !== undefined ? req.body.title : task.title;
    const nextDescription = req.body.description !== undefined ? req.body.description : task.description;
    const nextPriority = req.body.priority !== undefined ? req.body.priority : task.priority;
    const nextDeadline = req.body.deadline !== undefined ? req.body.deadline : task.deadline;

    const { rows } = await query(
      `
      UPDATE tasks
      SET title = $1,
          description = $2,
          priority = $3,
          deadline = $4,
          updated_at = NOW()
      WHERE id = $5
      RETURNING *
      `,
      [nextTitle, nextDescription, nextPriority, nextDeadline, req.params.id]
    );

    res.json(mapTask(rows[0]));
  } catch (error) {
    console.error('Ошибка обновления задачи:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  try {
    const { rows: foundRows } = await query(
      `SELECT * FROM tasks WHERE id = $1 LIMIT 1`,
      [req.params.id]
    );

    const task = mapTask(foundRows[0]);
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });

    if (req.user.role !== 'admin' && task.userId !== req.user.id) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    await query(`DELETE FROM tasks WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления задачи:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

function resolveUploadPathSafe(filePath) {
  const clientRoot = path.join(__dirname, '..', 'client');
  const uploadsRoot = path.join(clientRoot, 'uploads');

  const fullPath = path.normalize(path.join(clientRoot, filePath || ''));

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

    const { rows } = await query(
      `SELECT * FROM documents WHERE file_name = $1 LIMIT 1`,
      [fileName]
    );

    const doc = mapDocument(rows[0]);
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
  try {
    let sql = `SELECT * FROM documents WHERE id = $1`;
    const params = [Number(req.params.id)];

    if (req.user.role !== 'admin') {
      sql += ` AND user_id = $2`;
      params.push(req.user.id);
    }

    sql += ` LIMIT 1`;

    const { rows } = await query(sql, params);
    const document = mapDocument(rows[0]);

    if (!document) {
      return res.status(404).json({ error: 'Документ не найден' });
    }

    res.json(document);
  } catch (error) {
    console.error('Ошибка получения документа:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение всех документов с сортировкой
app.get('/api/documents', requireAuth, async (req, res) => {
  try {
    const { sortBy } = req.query;

    let orderSql = `ORDER BY created_at DESC`;

    if (sortBy === 'name') {
      orderSql = `ORDER BY name ASC`;
    }

    if (['pdf', 'doc', 'docx', 'xls', 'png', 'jpeg'].includes(sortBy)) {
      const upper = sortBy.toUpperCase();
      orderSql = `
        ORDER BY
          CASE
            WHEN file_type = '${upper}' THEN 0
            WHEN file_type = 'DOC'  THEN 1
            WHEN file_type = 'DOCX' THEN 2
            WHEN file_type = 'PDF'  THEN 3
            WHEN file_type = 'XLS'  THEN 4
            WHEN file_type = 'PNG'  THEN 5
            WHEN file_type = 'JPEG' THEN 6
            ELSE 7
          END ASC,
          created_at DESC
      `;
    }

    const { rows } = await query(
      `
      SELECT * FROM documents
      WHERE user_id = $1
      ${orderSql}
      `,
      [req.user.id]
    );

    res.json(rows.map(mapDocument));
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'Ошибка получения документов' });
  }
});

// Обновление документа
app.put('/api/documents/:id', requireAuth, async (req, res) => {
  try {
    let selectSql = `SELECT * FROM documents WHERE id = $1`;
    const selectParams = [Number(req.params.id)];

    if (req.user.role !== 'admin') {
      selectSql += ` AND user_id = $2`;
      selectParams.push(req.user.id);
    }
    selectSql += ` LIMIT 1`;

    const { rows: foundRows } = await query(selectSql, selectParams);
    const document = mapDocument(foundRows[0]);

    if (!document) {
      return res.status(404).json({ error: 'Документ не найден' });
    }

    const nextName = req.body.name !== undefined ? req.body.name : document.name;
    const nextFileName = req.body.fileName !== undefined ? req.body.fileName : document.fileName;
    const nextFileType = req.body.fileType !== undefined ? req.body.fileType : document.fileType;
    const nextFilePath = req.body.filePath !== undefined ? req.body.filePath : document.filePath;
    const nextUploadDate = req.body.uploadDate !== undefined ? req.body.uploadDate : document.uploadDate;

    const { rows } = await query(
      `
      UPDATE documents
      SET name = $1,
          file_name = $2,
          file_type = $3,
          file_path = $4,
          upload_date = $5,
          updated_at = NOW()
      WHERE id = $6
      RETURNING *
      `,
      [nextName, nextFileName, nextFileType, nextFilePath, nextUploadDate, document.id]
    );

    res.json(mapDocument(rows[0]));
  } catch (error) {
    console.error('Ошибка обновления документа:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удаление документа + физического файла
app.delete('/api/documents/:id', requireAuth, async (req, res) => {
  try {
    let selectSql = `SELECT * FROM documents WHERE id = $1`;
    const selectParams = [Number(req.params.id)];

    if (req.user.role !== 'admin') {
      selectSql += ` AND user_id = $2`;
      selectParams.push(req.user.id);
    }
    selectSql += ` LIMIT 1`;

    const { rows: foundRows } = await query(selectSql, selectParams);
    const document = mapDocument(foundRows[0]);

    if (!document) {
      return res.status(404).json({ error: 'Документ не найден' });
    }

    const fullPath = resolveUploadPathSafe(document.filePath);

    if (fullPath) {
      try {
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      } catch (e) {
        if (e?.code !== 'ENOENT') {
          console.error('Ошибка удаления файла:', e);
        }
      }
    } else {
      console.warn('Подозрительный filePath, пропускаю удаление файла:', document.filePath);
    }

    await query(`DELETE FROM documents WHERE id = $1`, [document.id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления документа:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* =======================
   Страницы (с проверкой аутентификации)
======================= */

// Middleware для проверки аутентификации на страницах
async function checkPageAuth(req, res, next) {
  try {
    if (req.path === '/login') {
      return next();
    }

    const token = req.cookies?.token;
    if (!token) {
      return res.redirect('/login');
    }

    const session = await getSessionWithUser(token);

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
  } catch (error) {
    console.error('Ошибка проверки page auth:', error);
    res.redirect('/login');
  }
}

// Применяем middleware ко всем страницам
app.use(['/tasks', '/documents', '/profile'], checkPageAuth);

app.get('/', (req, res) => {
  if (req.user) {
    res.sendFile(path.join(clientPath, 'index.html'));
  } else {
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
   УВЕДОМЛЕНИЯ
======================= */

// 0) Админ: список пользователей
app.get('/api/admin/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await query(
      `
      SELECT id, fullname, username, role
      FROM users
      ORDER BY id ASC
      `
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка получения пользователей' });
  }
});

// 1) Получить уведомления (только свои)
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const order = (req.query.order === 'old') ? 'ASC' : 'DESC';

    const { rows } = await query(
      `
      SELECT *
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at ${order}
      `,
      [req.user.id]
    );

    res.json(rows.map(n => ({
      id: n.id,
      title: n.title,
      body: n.body,
      is_read: n.is_read ? 1 : 0,
      created_at: n.created_at
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка получения уведомлений' });
  }
});

// 2) Пометить как прочитанное
app.post('/api/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Некорректный id' });

    const { rowCount } = await query(
      `
      UPDATE notifications
      SET is_read = TRUE, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      `,
      [id, req.user.id]
    );

    if (!rowCount) return res.status(404).json({ error: 'Не найдено' });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка обновления уведомления' });
  }
});

// 3) Удалить уведомление
app.delete('/api/notifications/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Некорректный id' });

    const { rowCount } = await query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );

    if (!rowCount) return res.status(404).json({ error: 'Не найдено' });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка удаления уведомления' });
  }
});

// 4) Админ: отправить уведомление
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

    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const { rows } = await query(
      `
      INSERT INTO notifications (title, body, user_id, is_read, created_at, updated_at)
      VALUES ($1, $2, $3, FALSE, NOW(), NOW())
      RETURNING id
      `,
      [title, body, userId]
    );

    res.json({ ok: true, id: rows[0].id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка создания уведомления' });
  }
});

/* =======================
   ОБЪЯВЛЕНИЕ
======================= */
async function ensureAnnouncementRow() {
  await query(
    `
    INSERT INTO announcements (id, text, created_at, updated_at)
    VALUES (1, '', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
    `
  );
}

// API: получить объявление
app.get('/api/announcement', requireAuth, async (req, res) => {
  try {
    await ensureAnnouncementRow();
    const { rows } = await query(`SELECT * FROM announcements WHERE id = 1 LIMIT 1`);
    const row = mapAnnouncement(rows[0]);
    res.json({ text: row?.text || '' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка получения объявления' });
  }
});

// API: изменить объявление
app.put('/api/admin/announcement', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await ensureAnnouncementRow();
    const text = String(req.body.text || '').trim();

    await query(
      `
      UPDATE announcements
      SET text = $1, updated_at = NOW()
      WHERE id = 1
      `,
      [text]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сохранения объявления' });
  }
});

/* =======================
   СТРАНИЦА админ-редактирования
======================= */
app.use(['/tasks', '/documents', '/profile', '/admin_announcement'], checkPageAuth);

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
    const { rows } = await query(
      `SELECT * FROM documents WHERE id = $1 LIMIT 1`,
      [req.params.id]
    );

    const doc = mapDocument(rows[0]);
    if (!doc) return res.status(404).send('Not found');

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
======================= */

// Создание документа
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

    const { rows } = await query(
      `
      INSERT INTO documents (
        name, file_name, file_type, file_path, upload_date, user_id, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *
      `,
      [name, fileName, fileType, filePath, new Date(), req.user.id]
    );

    res.status(201).json(mapDocument(rows[0]));
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'Ошибка создания документа' });
  }
});

// Админ-API: все документы + владелец + сортировка/фильтр
app.get('/api/admin/documents', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const sortBy = String(req.query.sortBy || 'new').toLowerCase();
    const type = String(req.query.type || '').toUpperCase().trim();

    const params = [];
    let whereSql = '';
    if (type && type !== 'ALL') {
      params.push(type);
      whereSql = `WHERE d.file_type = $1`;
    }

    let orderSql = `ORDER BY d.created_at DESC`;
    if (sortBy === 'old') orderSql = `ORDER BY d.created_at ASC`;
    if (sortBy === 'name') orderSql = `ORDER BY d.name ASC`;

    const { rows } = await query(
      `
      SELECT
        d.*,
        u.username AS owner_username,
        u.fullname AS owner_fullname
      FROM documents d
      LEFT JOIN users u ON u.id = d.user_id
      ${whereSql}
      ${orderSql}
      `,
      params
    );

    res.json(rows.map(d => ({
      id: d.id,
      name: d.name,
      fileName: d.file_name,
      fileType: d.file_type,
      uploadDate: d.upload_date,
      createdAt: d.created_at,
      ownerName: d.owner_fullname || d.owner_username || '—',
      ownerUsername: d.owner_username || ''
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка получения документов' });
  }
});

/* =======================
   USERS (ADMIN)
======================= */

// Отдать полный список пользователей
app.get('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await query(
      `
      SELECT id, fullname, email, phone, position, role, username
      FROM users
      ORDER BY id ASC
      `
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки пользователей' });
  }
});

// Создание пользователя
app.post('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const fullname = String(req.body?.fullname ?? '').trim();
    const email = String(req.body?.email ?? '').trim();
    const phone = String(req.body?.phone ?? '').trim();
    const position = String(req.body?.position ?? '').trim();
    const role = String(req.body?.role ?? '').trim();
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');

    if (!fullname || !email || !phone || !position || !role || !username || !password) {
      return res.status(400).json({ error: 'Заполни все поля' });
    }

    const { rows: conflictRows } = await query(
      `
      SELECT id, username, email, phone
      FROM users
      WHERE username = $1 OR email = $2 OR phone = $3
      LIMIT 1
      `,
      [username, email, phone]
    );

    const conflict = conflictRows[0];
    if (conflict) {
      if (conflict.username === username) return res.status(400).json({ error: 'Логин уже занят' });
      if (conflict.email === email) return res.status(400).json({ error: 'Email уже занят' });
      if (conflict.phone === phone) return res.status(400).json({ error: 'Телефон уже занят' });
      return res.status(400).json({ error: 'Пользователь с такими данными уже существует' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    const { rows } = await query(
      `
      INSERT INTO users (
        fullname, email, phone, position, role, username, password, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING id, fullname, email, phone, position, role, username
      `,
      [fullname, email, phone, position, role, username, hashedPassword]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err?.code === '23505') {
      if (String(err.constraint || '').includes('username')) return res.status(400).json({ error: 'Логин уже занят' });
      if (String(err.constraint || '').includes('email')) return res.status(400).json({ error: 'Email уже занят' });
      if (String(err.constraint || '').includes('phone')) return res.status(400).json({ error: 'Телефон уже занят' });
      return res.status(400).json({ error: 'Поля должны быть уникальными' });
    }
    console.error('Ошибка создания пользователя:', err);
    res.status(500).json({ error: 'Ошибка создания пользователя' });
  }
});

// Редактирование пользователя
app.put('/api/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = await getUserById(id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const { fullname, email, phone, position, role, username, password } = req.body;

    const nextFullname = fullname !== undefined ? String(fullname).trim() : user.fullname;
    const nextEmail = email !== undefined ? String(email).trim() : user.email;
    const nextPhone = phone !== undefined ? String(phone).trim() : user.phone;
    const nextPosition = position !== undefined ? String(position).trim() : user.position;
    const nextRole = role !== undefined ? String(role).trim() : user.role;
    const nextUsername = username !== undefined ? String(username).trim() : user.username;

    if (!nextFullname) return res.status(400).json({ error: 'ФИО обязательно' });
    if (!nextEmail) return res.status(400).json({ error: 'Email обязателен' });
    if (!nextPhone) return res.status(400).json({ error: 'Телефон обязателен' });
    if (!nextPosition) return res.status(400).json({ error: 'Должность обязательна' });
    if (!nextRole) return res.status(400).json({ error: 'Роль обязательна' });
    if (!nextUsername) return res.status(400).json({ error: 'Логин обязателен' });

    const { rows: conflictRows } = await query(
      `
      SELECT id, username, email, phone
      FROM users
      WHERE id <> $1
        AND (username = $2 OR email = $3 OR phone = $4)
      LIMIT 1
      `,
      [id, nextUsername, nextEmail, nextPhone]
    );

    const conflict = conflictRows[0];
    if (conflict) {
      if (conflict.username === nextUsername) {
        return res.status(400).json({ error: 'Логин уже занят' });
      }
      if (conflict.email === nextEmail) {
        return res.status(400).json({ error: 'Email уже занят' });
      }
      if (conflict.phone === nextPhone) {
        return res.status(400).json({ error: 'Телефон уже занят' });
      }
      return res.status(400).json({ error: 'Пользователь с такими данными уже существует' });
    }

    let nextPassword = user.password;
    if (password !== undefined) {
      const raw = String(password);
      if (!raw) return res.status(400).json({ error: 'Пароль не может быть пустым' });
      nextPassword = bcrypt.hashSync(raw, 10);
    }

    const { rows } = await query(
      `
      UPDATE users
      SET fullname = $1,
          email = $2,
          phone = $3,
          position = $4,
          role = $5,
          username = $6,
          password = $7,
          updated_at = NOW()
      WHERE id = $8
      RETURNING id, fullname, email, phone, position, role, username
      `,
      [nextFullname, nextEmail, nextPhone, nextPosition, nextRole, nextUsername, nextPassword, id]
    );

    res.json(rows[0]);
  } catch (err) {
    if (err?.code === '23505') {
      if (String(err.constraint || '').includes('username')) return res.status(400).json({ error: 'Логин уже занят' });
      if (String(err.constraint || '').includes('email')) return res.status(400).json({ error: 'Email уже занят' });
      if (String(err.constraint || '').includes('phone')) return res.status(400).json({ error: 'Телефон уже занят' });
      return res.status(400).json({ error: 'Поля должны быть уникальными' });
    }
    console.error('Ошибка обновления пользователя:', err);
    res.status(500).json({ error: 'Ошибка обновления пользователя' });
  }
});

// Удаление пользователя
app.delete('/api/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = await getUserById(id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    await query(`DELETE FROM users WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Ошибка удаления пользователя:', err);
    res.status(500).json({ error: 'Ошибка удаления пользователя' });
  }
});

/* =======================
   404
======================= */
app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});

/* =======================
   Инициализация и запуск
======================= */
async function start() {
  try {
    await initDb();
    console.log('✅ PostgreSQL структура готова');

    await createDefaultUsers();

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
  } catch (err) {
    console.error('❌ Ошибка запуска:', err);
    process.exit(1);
  }
}

start();