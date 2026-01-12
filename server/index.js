// index.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');
const { Op } = require('sequelize');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 3000;

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
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    priority: {
        type: DataTypes.STRING,
        defaultValue: 'Средний'
    },
    deadline: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    timestamps: true
});

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




// Генерация токена
function generateToken() {
    return 'token_' + Math.random().toString(36).substr(2) + Date.now().toString(36);
}

// Middleware для проверки аутентификации
async function requireAuth(req, res, next) {
    const token =
        req.headers.authorization?.replace('Bearer ', '') ||
        req.cookies?.token;

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

    req.token = token;
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
app.get('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: ['id', 'username', 'role', 'createdAt', 'updatedAt'],
            order: [['createdAt', 'DESC']]
        });
        res.json(users);
    } catch (error) {
        console.error('Ошибка получения пользователей:', error);
        res.status(500).json({ error: 'Ошибка получения пользователей' });
    }
});

// Создание нового пользователя (только для админов)
app.post('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const { username, password, role } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Логин и пароль обязательны' });
        }
        
        const existing = await User.findOne({ where: { username } });
        if (existing) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }
        
        const hashedPassword = bcrypt.hashSync(password, 10);
        const user = await User.create({
            username,
            password: hashedPassword,
            role: role || 'client'
        });
        
        res.status(201).json({
            id: user.id,
            username: user.username,
            role: user.role,
            createdAt: user.createdAt
        });
    } catch (error) {
        console.error('Ошибка создания пользователя:', error);
        res.status(500).json({ error: 'Ошибка создания пользователя' });
    }
});

/* =======================
   API для задач (требуется аутентификация)
======================= */
app.get('/api/tasks', requireAuth, async (req, res) => {
    const { sortBy } = req.query;

    let order = [['createdAt', 'DESC']];

    if (sortBy === 'old') {
        order = [['createdAt', 'ASC']];
    }

    if (sortBy === 'deadline') {
        order = [['deadline', 'ASC']];
    }

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

    const tasks = await Task.findAll({ order });
    res.json(tasks);
});

app.post('/api/tasks', requireAuth, async (req, res) => {
    try {
        const task = await Task.create(req.body);
        res.status(201).json(task);
    } catch (e) {
        res.status(400).json({ error: 'Ошибка создания задачи' });
    }
});

app.put('/api/tasks/:id', requireAuth, async (req, res) => {
    const task = await Task.findByPk(req.params.id);
    if (!task) {
        return res.status(404).json({ error: 'Задача не найдена' });
    }

    await task.update(req.body);
    res.json(task);
});

app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
    const task = await Task.findByPk(req.params.id);
    if (!task) {
        return res.status(404).json({ error: 'Задача не найдена' });
    }

    await task.destroy();
    res.json({ success: true });
});

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

// Скачивание файла (требуется аутентификация)
app.get('/download/:fileName', requireAuth, (req, res) => {
    const filePath = path.join(__dirname, '..', 'client', 'uploads', req.params.fileName);
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).json({ error: 'Файл не найден' });
    }
});

// Получение документа по ID
app.get('/api/documents/:id', requireAuth, async (req, res) => {
    try {
        const document = await Document.findByPk(req.params.id);
        if (!document) {
            return res.status(404).json({ error: 'Документ не найден' });
        }
        res.json(document);
    } catch (e) {
        console.error(e);
        res.status(400).json({ error: 'Ошибка получения документа' });
    }
});

// Получение всех документов с сортировкой
app.get('/api/documents', requireAuth, async (req, res) => {
    try {
        const { sortBy } = req.query;

        let order = [['createdAt', 'DESC']];

        // сортировка по имени
        if (sortBy === 'name') {
            order = [['name', 'ASC']];
        }

        // сортировка по типу файла
        if (['pdf', 'doc', 'docx', 'xls', 'png', 'jpeg'].includes(sortBy)) {
            order = [
                [
                    sequelize.literal(`
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
                    `),
                    'ASC'
                ],
                ['createdAt', 'DESC']
            ];
        }

        const documents = await Document.findAll({ order });
        res.json(documents);
    } catch (e) {
        console.error(e);
        res.status(400).json({ error: 'Ошибка получения документов' });
    }
});

// Создание документа с поддержкой кириллицы
app.post('/api/documents', requireAuth, async (req, res) => {
    try {
        // Берём данные из формы
        let { name, fileName, fileType, filePath } = req.body;

        // Обеспечиваем корректную кодировку UTF-8
        if (typeof name === 'string') {
            name = name.trim(); // убираем лишние пробелы
            name = name.normalize('NFC'); // нормализуем Unicode
        }

        if (typeof fileName === 'string') {
            fileName = fileName.trim();
            fileName = fileName.normalize('NFC');
        }

        // Создаём запись в базе
        const document = await Document.create({
            name,
            fileName,
            fileType,
            filePath,
            uploadDate: new Date()
        });

        res.status(201).json(document);
    } catch (e) {
        console.error(e);
        res.status(400).json({ error: 'Ошибка создания документа' });
    }
});

// Обновление документа
app.put('/api/documents/:id', requireAuth, async (req, res) => {
    try {
        const document = await Document.findByPk(req.params.id);
        if (!document) {
            return res.status(404).json({ error: 'Документ не найден' });
        }

        await document.update(req.body);
        res.json(document);
    } catch (e) {
        console.error(e);
        res.status(400).json({ error: 'Ошибка обновления документа' });
    }
});

// Удаление документа
app.delete('/api/documents/:id', requireAuth, async (req, res) => {
    try {
        const document = await Document.findByPk(req.params.id);
        if (!document) {
            return res.status(404).json({ error: 'Документ не найден' });
        }

        // Удаляем файл с диска
        const filePath = path.join(__dirname, '..', 'client', document.filePath);
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        await document.destroy();
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(400).json({ error: 'Ошибка удаления документа' });
    }
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
   404
======================= */
app.use((req, res) => {
    res.status(404).json({ error: 'Маршрут не найден' });
});

/* =======================
   Синхронизация БД и запуск сервера
======================= */
sequelize.sync({ force: false })
    .then(async () => {
        console.log('✅ База данных синхронизирована');
        
        // Создаем пользователей по умолчанию
        await createDefaultUsers();
        
        // Запускаем сервер
        app.listen(PORT, () => {
            console.log(`Сервер готов http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error('❌ Ошибка синхронизации БД:', err);
        process.exit(1);
    });