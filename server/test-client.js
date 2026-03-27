const axios = require('axios');

const API_URL = 'http://localhost:3000/api';

async function testAPI() {
    try {
        console.log('🚀 Тестирование API задач...\n');

        console.log('1. Проверка соединения...');
        const testRes = await axios.get(`${API_URL}/test`);
        console.log('✅', testRes.data.message, '\n');

        console.log('2. Создание тестовых задач...');
        const tasksToCreate = [
            { title: 'Первая задача', priority: 'Высокий' },
            { title: 'Вторая задача', description: 'С описанием', priority: 'Средний' },
            { title: 'Третья задача', priority: 'Низкий', isCompleted: true }
        ];

        for (const taskData of tasksToCreate) {
            const res = await axios.post(`${API_URL}/tasks`, taskData);
            console.log(`✅ Создана: ${res.data.title} (ID: ${res.data.id})`);
        }
        console.log('');

        console.log('3. Получение всех задач...');
        const allTasks = await axios.get(`${API_URL}/tasks`);
        console.log(`✅ Найдено задач: ${allTasks.data.length}`);
        allTasks.data.forEach(task => {
            console.log(`   - ${task.id}: ${task.title} (${task.priority})`);
        });
        console.log('');

        console.log('4. Сортировка по приоритету...');
        const sortedTasks = await axios.get(`${API_URL}/tasks?sortBy=priority`);
        console.log('✅ Отсортировано по приоритету');
        sortedTasks.data.forEach(task => {
            console.log(`   - ${task.priority}: ${task.title}`);
        });
        console.log('');

        console.log('5. Статистика...');
        const stats = await axios.get(`${API_URL}/stats`);
        console.log(`✅ Всего задач: ${stats.data.total}`);
        console.log(`✅ Выполнено: ${stats.data.completed}`);
        console.log(`✅ Высокий приоритет: ${stats.data.highPriority}`);

    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        if (error.response) {
            console.error('Детали:', error.response.data);
        }
    }
}

testAPI();
