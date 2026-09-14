export function orderCard(summary) {
  return `${summary.id}: ${summary.itemCount} item(s) — ${summary.status}`;
}
