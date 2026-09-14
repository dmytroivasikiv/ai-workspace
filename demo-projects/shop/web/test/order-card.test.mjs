import test from "node:test";
import assert from "node:assert/strict";
import { orderCard } from "../src/order-card.mjs";

test("renders the API order summary", () => {
  assert.equal(orderCard({ id: "ord-1", itemCount: 2, status: "paid" }), "ord-1: 2 item(s) — paid");
});
