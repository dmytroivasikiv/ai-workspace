export function orderSummary(order) {
  if (!order?.id) throw new TypeError("order.id is required");
  const itemCount = Array.isArray(order.items) ? order.items.length : 0;
  return { id: order.id, itemCount, status: order.status ?? "pending" };
}
