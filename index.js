const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');

const bot = new Telegraf('8495287734:AAH8ZCbjy_XaoLHS0gsasSDHomiNOdGr_0c');
const DATA_FILE = '/tmp/data.json'; // используем /tmp для записи на Render

// Загружаем данные
let data = {};
if (fs.existsSync(DATA_FILE)) {
  data = JSON.parse(fs.readFileSync(DATA_FILE));
} else {
  fs.writeFileSync(DATA_FILE, JSON.stringify({}));
}

// Сохранение данных
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Получение всех машин
function getCarsList() {
  const keys = Object.keys(data);
  if (keys.length === 0) return 'Пока нет добавленных автомобилей.';
  return keys.map((car, i) => `${i + 1}. ${car}`).join('\n');
}

// Хранение состояния пользователя
const userState = {};

// Начало
bot.start((ctx) => {
  userState[ctx.chat.id] = {};
  ctx.reply(
    'Привет! Я бот для учёта расходов по автомобилям. Что делаем?',
    Markup.keyboard([
      ['➕ Добавить автомобиль', '💰 Добавить расход'],
      ['📄 Отчёт', '🚗 Список автомобилей']
    ]).resize()
  );
});

// Добавление автомобиля
bot.hears('➕ Добавить автомобиль', (ctx) => {
  userState[ctx.chat.id] = { step: 'add_car' };
  ctx.reply('Введи название автомобиля и последние 6 символов VIN, например: Tiguan • 123456', 
    Markup.keyboard([['⬅️ Назад']]).resize()
  );
});

// Добавление расхода
bot.hears('💰 Добавить расход', (ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.reply('Сначала добавь автомобиль.');
    return;
  }
  userState[ctx.chat.id] = { step: 'choose_car_for_expense' };
  ctx.reply('Выбери автомобиль:', Markup.keyboard([...Object.keys(data), '⬅️ Назад']).resize());
});

// Слушаем все текстовые сообщения
bot.on('text', (ctx) => {
  const state = userState[ctx.chat.id] || {};
  const text = ctx.message.text.trim();

  // Обработка кнопки "назад" или "отмена"
  if (text === '⬅️ Назад' || text === '⬅️ Отмена') {
    switch (state.step) {
      case 'add_car':
      case 'choose_car_for_expense':
      case 'choose_person':
      case 'expense_name':
      case 'expense_cost':
        userState[ctx.chat.id] = {};
        ctx.reply('Действие отменено. Выберите опцию на клавиатуре.', 
          Markup.keyboard([
            ['➕ Добавить автомобиль', '💰 Добавить расход'],
            ['📄 Отчёт', '🚗 Список автомобилей']
          ]).resize()
        );
        return;
      default:
        userState[ctx.chat.id] = {};
        return;
    }
  }

  switch (state.step) {
    // Добавление автомобиля
    case 'add_car':
      if (!data[text]) {
        data[text] = {
          buy: { Максим: 0, Андрей: 0 },
          expenses: [],
          salePrice: 0
        };
        saveData();
        ctx.reply(`Автомобиль "${text}" добавлен!`);
      } else {
        ctx.reply('Такой автомобиль уже есть.');
      }
      userState[ctx.chat.id] = {};
      break;

    // Выбор автомобиля для расхода
    case 'choose_car_for_expense':
      if (!data[text]) {
        ctx.reply('Такого автомобиля нет. Выбери из списка.');
        return;
      }
      state.step = 'choose_person';
      state.car = text;
      ctx.reply('Кто вносит расход?', Markup.keyboard([['Максим'], ['Андрей'], ['⬅️ Отмена']]).resize());
      break;

    // Выбор человека
    case 'choose_person':
      if (text !== 'Максим' && text !== 'Андрей') return;
      state.step = 'expense_name';
      state.person = text;
      ctx.reply('Введи название статьи расхода (например: ремонт, мойка и т.д.)', 
        Markup.keyboard([['⬅️ Назад']]).resize()
      );
      break;

    // Название статьи расхода
    case 'expense_name':
      state.step = 'expense_cost';
      state.expenseName = text;
      ctx.reply(`Теперь введи сумму для "${text}"`, Markup.keyboard([['⬅️ Назад']]).resize());
      break;

    // Сумма расхода
    case 'expense_cost':
      const cost = parseFloat(text);
      if (isNaN(cost)) {
        ctx.reply('Нужно ввести число!');
        return;
      }
      data[state.car].expenses.push({
        person: state.person,
        expenseName: state.expenseName,
        cost
      });
      saveData();
      ctx.reply(`Расход "${state.expenseName}" на сумму ${cost}₽ добавлен от ${state.person}.`);
      userState[ctx.chat.id] = {};
      break;

    default:
      ctx.reply('Выберите действие через клавиатуру.');
      break;
  }
});

// Отчёт
bot.hears('📄 Отчёт', (ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.reply('Пока нет данных.');
    return;
  }

  let text = '';
  for (const [car, info] of Object.entries(data)) {
    const totalByMax = info.expenses
      .filter(e => e.person === 'Максим')
      .reduce((sum, e) => sum + e.cost, 0);
    const totalByAnd = info.expenses
      .filter(e => e.person === 'Андрей')
      .reduce((sum, e) => sum + e.cost, 0);
    const total = totalByMax + totalByAnd;

    text += `🚗 ${car}\n`;
    text += `Максим: ${totalByMax}₽\nАндрей: ${totalByAnd}₽\nВсего: ${total}₽\n\n`;
  }

  ctx.reply(text);
});

// Список автомобилей
bot.hears('🚗 Список автомобилей', (ctx) => {
  ctx.reply(getCarsList());
});

// Запуск бота через long polling (для Background Worker на Render)
bot.launch().then(() => {
  console.log('Бот запущен через long polling (Render Worker)');
});
