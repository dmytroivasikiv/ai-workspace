export function acknowledgement(ticketId) {
  if (!ticketId) throw new TypeError("ticketId is required");
  return `Ticket ${ticketId} received. We will follow up shortly.`;
}
