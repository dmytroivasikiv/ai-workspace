import test from "node:test";
import assert from "node:assert/strict";
import { acknowledgement } from "../src/reply.mjs";

test("acknowledges a ticket without customer data", () => {
  assert.equal(acknowledgement("SUP-42"), "Ticket SUP-42 received. We will follow up shortly.");
});
