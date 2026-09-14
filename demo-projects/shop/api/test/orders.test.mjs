import test from "node:test";
import assert from "node:assert/strict";
import { orderSummary } from "../src/orders.mjs";

test("returns the stable order summary contract", () => {
  assert.deepEqual(orderSummary({ id: "ord-1", items: [{}, {}], status: "paid" }), {
    id: "ord-1",
    itemCount: 2,
    status: "paid",
  });
});
