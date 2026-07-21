// Игнорируем "мусорные" ошибки страницы (ResizeObserver и т.п.),
// чтобы мониторинговый тест не падал из-за посторонних JS-ошибок фронта.
Cypress.on('uncaught:exception', () => false);

describe('Full Contract Lifecycle E2E (Провайдер -> Договор -> Принятие)', () => {

  // ── Данные ───────────────────────────────────────────────────────────────
  // Кабинет A (testUser001) — логин/пароль берём из cypress.env.json
  // через команду cy.env() (Cypress.env() в этом проекте отключён:
  // allowCypressEnv: false).
  //
  // Кабинет B — получатель договора (testUser002)
  const USER_B = {
    login: 'testUser002',
    password: 'Sobiroff_23',
  };

  const BASE = 'https://b2b.metatrip.asia';

  // Данные провайдера
  const providerName = 'avia';
  const providerTag = 'тег';

  // Данные договора
  const agreementNumber = 'avtotest_agreement';

  // ── Хелпер авторизации ─────────────────────────────────────────────────────
  const login = (userLogin, userPassword) => {
    cy.intercept({ method: 'POST', url: '**/login*' }).as('apiAuth');

    cy.clearCookies();
    cy.clearLocalStorage();
    cy.window().then((win) => win.sessionStorage.clear());

    cy.visit(`${BASE}/sign-in`, { timeout: 30000 });
    cy.url({ timeout: 20000 }).should('include', '/sign-in');

    cy.get('input[type="text"]', { timeout: 15000 })
      .should('be.visible')
      .clear()
      .type(userLogin, { delay: 50, log: false });

    cy.get('input[type="password"]')
      .should('be.visible')
      .clear()
      .type(userPassword, { delay: 50, log: false });

    cy.wait(1000);
    // Кнопка входа активна только после заполнения полей — ждём активную
    cy.get('button.sign-in-page__submit')
      .should('be.visible')
      .and('not.be.disabled')
      .click({ force: true });

    cy.wait('@apiAuth', { timeout: 20000 }).then((interception) => {
      if ((interception.response?.statusCode || 500) >= 400) {
        throw new Error('🆘 Ошибка сервера при авторизации');
      }
    });
    cy.url({ timeout: 20000 }).should('not.include', '/sign-in');
  };

  // ── Хелпер выхода из кабинета через профиль ────────────────────────────────
  const logout = () => {
    // Клик по аватару профиля в шапке (кастомный AppAvatar -> .app-avatar)
    cy.get('.app-avatar.cursor-pointer', { timeout: 15000 })
      .first()
      .should('be.visible')
      .click();
    // Попап-меню PrimeVue иногда не открывается с первого клика (гонка после
    // навигации) — если меню не появилось, кликаем по аватару ещё раз.
    cy.get('body').then(($body) => {
      if ($body.find('.app-header-user-menu:visible').length === 0) {
        cy.get('.app-avatar.cursor-pointer').first().click({ force: true });
      }
    });
    // В выпадающем меню жмём "Выйти"
    cy.get('.app-header-user-menu', { timeout: 10000 })
      .contains('.app-header-user-menu-item', /Выйти|Logout|Chiqish/i)
      .should('be.visible')
      .click({ force: true });
  };

  before(() => {
    cy.writeFile('auth_api_status.txt', '0');
  });

  it('Создание провайдера (A) -> Создание договора (A) -> Принятие договора (B)', () => {
    cy.viewport(1280, 800);

    // =========================================================================
    // ШАГ 0: АВТОРИЗАЦИЯ В КАБИНЕТ A (testUser001)
    // =========================================================================
    cy.log('🟢 ШАГ 0: Авторизация в кабинет A');
    cy.env(['LOGIN_EMAIL', 'LOGIN_PASSWORD']).then(({ LOGIN_EMAIL, LOGIN_PASSWORD }) => {
      login(LOGIN_EMAIL, LOGIN_PASSWORD);
    });

    // =========================================================================
    // ШАГ 1: СОЗДАНИЕ ПРОВАЙДЕРА
    // =========================================================================
    cy.log('🟢 ШАГ 1: Переход в раздел Провайдеры');
    cy.contains('.sidebar-link', /Провайдеры|Providers/i, { timeout: 25000 })
      .scrollIntoView()
      .click();
    cy.url({ timeout: 20000 }).should('include', '/partners');

    cy.log('⚠️ Открываем форму добавления провайдера');
    cy.get('button.app-button--primary')
      .contains(/Добавить провайдер|Add Provider/i)
      .should('be.visible')
      .click({ force: true });
    cy.wait(1500);

    // --- Шаг "Названия провайдера" -------------------------------------------
    // 1. Название провайдера
    cy.get('.p-dialog input').eq(0)
      .should('be.visible')
      .clear()
      .type(providerName, { delay: 50 });

    // 2. Типы продуктов -> Перелеты
    cy.contains('.p-select', /Выберите типы продуктов|Select product types/i)
      .should('be.visible')
      .click();
    cy.get('.p-select-panel, .p-select-overlay, [role="listbox"]')
      .contains(/Перел[её]ты|Flights/i)
      .should('be.visible')
      .click();

    // 3. Тег
    cy.get('.p-dialog input').eq(1)
      .should('be.visible')
      .clear()
      .type(providerTag, { delay: 50 });

    // 4. Продолжить (Названия -> Системы бронирования)
    // Кнопка активна только когда заполнены имя, тип продукта и тег —
    // ждём, пока перестанет быть disabled (иначе клик по неактивной = no-op).
    cy.get('.p-dialog-footer').contains('button', /Продолжить|Continue/i)
      .should('be.visible')
      .and('not.be.disabled')
      .click();

    // --- Шаг "Системы бронирования" ------------------------------------------
    cy.log('⚠️ Система бронирования: выбираем Чартер');
    cy.contains('.bs-tab', /Чартер|Charter/i, { timeout: 15000 })
      .should('be.visible')
      .click();

    // Дожидаемся загрузки провайдеров и выбираем первого (радио-карточка)
    cy.get('.provider-card', { timeout: 20000 })
      .should('be.visible')
      .first()
      .click();

    // Провайдер должен стать выбранным
    cy.get('.provider-card--active', { timeout: 10000 }).should('exist');

    // Продолжить (Системы бронирования -> Баланс).
    // Кнопка активируется только после выбора провайдера — ждём активную.
    cy.get('.p-dialog-footer').contains('button', /Продолжить|Continue/i)
      .should('be.visible')
      .and('not.be.disabled')
      .click();

    // --- Шаг "Баланс провайдера" ---------------------------------------------
    cy.log('⚠️ Выбор валюты UZS');
    cy.contains('.p-select', /Валюта не выбрана|Currency not selected/i)
      .should('be.visible')
      .click();
    // В списке всего 4 валюты (USD/RUB/EUR/UZS), поля фильтра нет — кликаем по UZS
    cy.get('.p-select-overlay, .p-select-panel, [role="listbox"]')
      .contains(/^UZS$/)
      .should('be.visible')
      .click();

    cy.log('⚠️ Ввод суммы активации');
    cy.contains(/Сумма Активации|Activation Amount/i)
      .parent()
      .find('input')
      .should('be.visible')
      .type('1', { delay: 50 });

    // Финальное сохранение провайдера (кнопка активна после выбора валюты и суммы)
    cy.get('.p-dialog-footer').contains('button', /Добавить|Add/i)
      .should('be.visible')
      .and('not.be.disabled')
      .click();

    cy.get('.p-dialog').should('not.exist');
    cy.log('✅ Провайдер успешно создан!');
    cy.writeFile('auth_api_status.txt', '1');

    // =========================================================================
    // ШАГ 2: СОЗДАНИЕ ДОГОВОРА (кабинет A)
    // =========================================================================
    cy.log('🟢 ШАГ 2: Переход в раздел Договора');
    // Раскрываем родительский пункт меню "Договора"
    cy.contains('.sidebar-link.has-children', /Договора|Contracts/i, { timeout: 25000 })
      .scrollIntoView()
      .click();
    // В подменю кликаем на список договоров
    cy.get('.sidebar-submenu')
      .contains('.sidebar-link', /Договора|Contracts/i)
      .should('be.visible')
      .click();
    cy.url({ timeout: 20000 }).should('include', '/agreements');

    cy.log('⚠️ Кнопка "Создать договор"');
    cy.contains('button', /Создать договор|Create agreement/i)
      .should('be.visible')
      .click({ force: true });
    cy.url({ timeout: 20000 }).should('include', '/agreements/create');

    // --- Шаг 1 договора: Получатель ------------------------------------------
    cy.log('⚠️ Выбор получателя: testUser002');
    cy.get('.recipient-search input', { timeout: 15000 })
      .should('be.visible')
      .clear()
      .type(USER_B.login, { delay: 50 });

    // Ждём результаты поиска и кликаем на найденного партнёра
    cy.get('.partner-item', { timeout: 15000 })
      .should('be.visible')
      .first()
      .click({ force: true });

    // Продолжить (Получатель -> Продукты). Активна после выбора получателя.
    cy.get('.create-footer').contains('button', /Продолжить|Continue/i)
      .should('be.visible')
      .and('not.be.disabled')
      .click({ force: true });

    // --- Шаг 2 договора: Продукты и провайдер --------------------------------
    cy.log('⚠️ Выбор провайдера avia');
    // Раскрываем все свёрнутые группы продуктов, чтобы увидеть провайдера
    cy.get('.product-group', { timeout: 15000 }).each(($g) => {
      if (!$g.hasClass('product-group--expanded')) {
        cy.wrap($g).find('.product-group__header').click({ force: true });
      }
    });
    // Кликаем на провайдера, которого создали (avia)
    cy.contains('.provider-row__name', providerName, { timeout: 15000 })
      .should('be.visible')
      .click({ force: true });

    // Продолжить (Продукты -> Настройка договора). Активна после выбора провайдера.
    cy.get('.create-footer').contains('button', /Продолжить|Continue/i)
      .should('be.visible')
      .and('not.be.disabled')
      .click({ force: true });

    // --- Шаг 3 договора: Настройка договора ----------------------------------
    cy.log('⚠️ Заполнение настроек договора');
    // Номер договора
    cy.contains('.finish-card', /Номер договора|Agreement number/i)
      .find('input')
      .should('be.visible')
      .clear()
      .type(agreementNumber, { delay: 50 });

    // Депозит
    cy.contains('.finish-limit-field', /Депозит|Deposit/i)
      .find('input')
      .should('be.visible')
      .type('1', { delay: 50 });

    // Валюта -> UZS
    cy.contains('.p-select', /Выберите валюту|Select currency/i)
      .should('be.visible')
      .click();
    cy.get('.p-select-overlay, .p-select-panel, [role="listbox"]')
      .contains(/^UZS$/)
      .should('be.visible')
      .click();

    // Продолжить (Настройка -> Просмотр). Активна после ввода номера, депозита и валюты.
    cy.get('.create-footer').contains('button', /Продолжить|Continue/i)
      .should('be.visible')
      .and('not.be.disabled')
      .click({ force: true });

    // --- Отправка договора ----------------------------------------------------
    cy.log('⚠️ Отправка договора');
    cy.get('.create-footer').contains('button', /Отправить договор|Send agreement/i)
      .should('be.visible')
      .and('not.be.disabled')
      .click({ force: true });

    // После успешной отправки нас возвращает в список договоров
    cy.url({ timeout: 20000 }).should('include', '/agreements');
    cy.log('✅ Договор создан и отправлен!');
    cy.writeFile('auth_api_status.txt', '2');

    // =========================================================================
    // ШАГ 3: ВЫХОД ИЗ КАБИНЕТА A И ПРИНЯТИЕ ДОГОВОРА В КАБИНЕТЕ B
    // =========================================================================
    cy.log('🟢 ШАГ 3: Выход из кабинета A через профиль');
    logout();

    cy.log('⚠️ Авторизация в кабинет B (testUser002)');
    login(USER_B.login, USER_B.password);

    // Переход: Договора -> Запросы
    cy.log('⚠️ Переход в Договора -> Запросы');
    cy.contains('.sidebar-link.has-children', /Договора|Contracts/i, { timeout: 25000 })
      .scrollIntoView()
      .click();
    cy.get('.sidebar-submenu')
      .contains('.sidebar-link', /Запросы|Requests/i)
      .should('be.visible')
      .click();
    cy.url({ timeout: 20000 }).should('include', '/requests');

    // Вкладка "Входящие" открыта по умолчанию — кликаем на первый входящий договор
    cy.log('⚠️ Открываем входящий договор');
    cy.get('.request-card', { timeout: 20000 }).should('be.visible');
    cy.get('.request-card')
      .first()
      .contains('button', /Просмотреть и принять приглашение|Посмотреть и принять|View and accept/i)
      .should('be.visible')
      .click({ force: true });

    // На странице договора жмём "Принять договор"
    cy.log('⚠️ Принимаем договор');
    cy.contains('button', /Принять договор|Accept agreement/i, { timeout: 20000 })
      .should('be.visible')
      .and('not.be.disabled')
      .click({ force: true });

    // После принятия приложение возвращает нас на страницу запросов —
    // дожидаемся перехода и даём UI устаканиться, иначе следующий logout()
    // сработает во время навигации и меню профиля не откроется.
    cy.url({ timeout: 20000 }).should('include', '/requests');
    cy.url({ timeout: 20000 }).should('not.match', /\/requests\/\d+/);
    cy.wait(2500);

    cy.log('✅ Договор принят в кабинете B!');
    cy.writeFile('auth_api_status.txt', '3');

    // =========================================================================
    // ШАГ 4: ВЫХОД ИЗ КАБИНЕТА B, ВХОД В КАБИНЕТ A И ПОПОЛНЕНИЕ БАЛАНСА
    // =========================================================================
    cy.log('🟢 ШАГ 4: Выход из кабинета B через профиль');
    logout();

    cy.log('⚠️ Авторизация обратно в кабинет A (testUser001)');
    cy.env(['LOGIN_EMAIL', 'LOGIN_PASSWORD']).then(({ LOGIN_EMAIL, LOGIN_PASSWORD }) => {
      login(LOGIN_EMAIL, LOGIN_PASSWORD);
    });

    // Переход: Договора -> Договора (список)
    cy.log('⚠️ Переход в раздел Договора');
    cy.contains('.sidebar-link.has-children', /Договора|Contracts/i, { timeout: 25000 })
      .scrollIntoView()
      .click();
    cy.get('.sidebar-submenu')
      .contains('.sidebar-link', /Договора|Contracts/i)
      .should('be.visible')
      .click();
    cy.url({ timeout: 20000 }).should('include', '/agreements');

    // Открываем созданный договор (карточка с получателем testUser002)
    cy.log('⚠️ Открываем созданный договор');
    cy.contains('.agreement-card', USER_B.login, { timeout: 20000 })
      .should('be.visible')
      .click({ force: true });
    cy.url({ timeout: 20000 }).should('match', /\/agreements\/\d+/);

    // Кнопка "Пополнить баланс" активна только когда договор принят/активен
    cy.log('⚠️ Пополнение баланса на 1');
    cy.contains('button', /Пополнить баланс|Top up balance/i, { timeout: 20000 })
      .should('be.visible')
      .and('not.be.disabled')
      .click({ force: true });

    // Модалка "Пополнение депозит": вводим сумму 1
    cy.get('.topup-dialog input, .p-dialog input', { timeout: 15000 })
      .should('be.visible')
      .clear()
      .type('1', { delay: 50 });

    // Подтверждаем пополнение (кнопка активна только после ввода суммы)
    cy.get('.p-dialog-footer').contains('button', /Пополнить|Top up/i)
      .should('be.visible')
      .and('not.be.disabled')
      .click();

    // Модалка должна закрыться
    cy.get('.p-dialog').should('not.exist');

    cy.log('✅ Баланс договора пополнен! Сценарий завершён.');
    cy.writeFile('auth_api_status.txt', '4');
  });
});
