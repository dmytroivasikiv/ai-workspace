---
name: order-summary-contract
description: "Order summaries contain id, itemCount, and status"
metadata:
  type: project
type: project-fact
domain: shop
repos: 
  - shop-api
  - shop-web
status: active
verified: true
updated: 2026-09-14
sources:
  - demo-projects/shop/api/test/orders.test.mjs
---

# Order summary contract

The stable response fields are `id`, `itemCount`, and `status`. Check both direct tests before changing them.
