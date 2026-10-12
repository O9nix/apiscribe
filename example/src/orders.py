@app.route("/orders")
def list_orders():
    """
    @api {GET} /orders Список заказов
    @apiGroup Orders
    @apiQuery {Number} [limit=20] Сколько заказов вернуть
    @apiQuery {String} [status] Фильтр по статусу
    @apiSuccess {Object[]} orders Список заказов
    @apiSuccess {Number} orders.id Идентификатор заказа
    @apiSuccessExample {json} Успех
      { "orders": [ { "id": 10 } ] }
    """
    return []
