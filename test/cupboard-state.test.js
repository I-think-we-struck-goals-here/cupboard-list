import assert from "node:assert/strict";
import test from "node:test";
import {
  applyOperations,
  normalizeState
} from "../api/_cupboard-state-core.js";

const firstItem = {
  id: "first",
  name: "Pasta",
  quantity: "1",
  lowLevel: "0",
  category: "Grains & Pasta"
};

test("normalizes the existing unversioned Blob format", () => {
  assert.deepEqual(normalizeState({ items: [firstItem] }), {
    version: 0,
    updatedAt: null,
    items: [firstItem],
    customCategories: []
  });
});

test("keeps unrelated updates from different devices", () => {
  const initial = {
    items: [
      firstItem,
      {
        id: "second",
        name: "Beans",
        quantity: "1",
        lowLevel: "0",
        category: "Canned Goods"
      }
    ]
  };

  const afterFirstPhone = applyOperations(
    initial,
    [{ type: "upsert", item: { ...firstItem, quantity: "2" } }],
    "2026-07-23T10:00:00.000Z"
  );
  const afterSecondPhone = applyOperations(
    afterFirstPhone,
    [
      {
        type: "upsert",
        item: {
          ...afterFirstPhone.items.find((item) => item.id === "second"),
          quantity: "3"
        }
      }
    ],
    "2026-07-23T10:00:01.000Z"
  );

  assert.equal(
    afterSecondPhone.items.find((item) => item.id === "first").quantity,
    "2"
  );
  assert.equal(
    afterSecondPhone.items.find((item) => item.id === "second").quantity,
    "3"
  );
  assert.equal(afterSecondPhone.version, 2);
});

test("supports deleting and restoring an item without replacing the list", () => {
  const deleted = applyOperations(
    { items: [firstItem] },
    [{ type: "delete", id: firstItem.id }]
  );
  assert.equal(deleted.items.length, 0);

  const restored = applyOperations(deleted, [
    { type: "upsert", item: firstItem }
  ]);
  assert.deepEqual(restored.items, [firstItem]);
});

test("preserves custom categories created by an upsert", () => {
  const state = applyOperations(null, [
    {
      type: "upsert",
      item: { ...firstItem, category: "Home" }
    }
  ]);

  assert.deepEqual(state.customCategories, ["Home"]);
});
