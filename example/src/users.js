/**
 * @apiDefine UserNotFound
 * @apiError (404) UserNotFound Пользователь с таким `id` не найден
 * @apiErrorExample {json} Ответ 404
 *   { "error": "UserNotFound" }
 */

/**
 * @api {GET} /users/:id Получить пользователя
 * @apiGroup Users
 * @apiDescription Возвращает профиль пользователя по идентификатору.
 *
 * Поле `email` доступно только владельцу профиля.
 * @apiPermission user
 * @apiHeader {String} Authorization Bearer-токен
 * @apiPath {Number} id Идентификатор пользователя
 * @apiSuccess {Number} id Идентификатор
 * @apiSuccess {String} name Имя
 * @apiSuccess {String} [email] Почта
 * @apiSuccessExample {json} Успех
 *   { "id": 1, "name": "Анна" }
 * @apiExample {curl} Пример запроса
 *   curl -H "Authorization: Bearer TOKEN" http://localhost:3000/users/1
 * @apiUse UserNotFound
 */
app.get('/users/:id', (req, res) => {});

/**
 * @api {POST} /users Создать пользователя
 * @apiGroup Users
 * @apiBody {String} name Имя
 * @apiBody {String} email Почта
 * @apiBody {String} [role=user] Роль
 * @apiBody {String} [phone] Телефон (добавлено в 1.1.0)
 * @apiSuccess (201) {Number} id Идентификатор нового пользователя
 * @apiError (400) ValidationError Неверные данные
 */
app.post('/users', (req, res) => {});

/**
 * @api {PATCH} /users/:id Обновить пользователя
 * @apiGroup Users
 * @apiSince 1.1.0
 * @apiPath {Number} id Идентификатор пользователя
 * @apiBody {String} [name] Новое имя
 * @apiSuccess {Number} id Идентификатор
 * @apiUse UserNotFound
 */
app.patch('/users/:id', (req, res) => {});
