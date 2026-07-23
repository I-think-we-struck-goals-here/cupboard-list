const BUILTIN_CATEGORIES = new Set([
  "Canned Goods",
  "Grains & Pasta",
  "Legumes & Flours",
  "Sauces & Condiments",
  "Spices & Seasonings",
  "Stock & Gravy",
  "Other"
]);

function normalizeItem(value) {
  if (!value || !value.id || !value.name || !value.category) {
    return null;
  }

  return {
    id: String(value.id),
    name: String(value.name).trim(),
    quantity: String(value.quantity ?? ""),
    lowLevel: String(value.lowLevel ?? "1"),
    category: String(value.category).trim()
  };
}

export function normalizeState(value) {
  const items = Array.isArray(value?.items)
    ? value.items.map(normalizeItem).filter(Boolean)
    : [];
  const customCategories = Array.isArray(value?.customCategories)
    ? value.customCategories
        .map((category) => String(category ?? "").trim())
        .filter((category) => category && !BUILTIN_CATEGORIES.has(category))
    : [];

  return {
    version:
      Number.isSafeInteger(value?.version) && value.version >= 0
        ? value.version
        : 0,
    updatedAt: value?.updatedAt ? String(value.updatedAt) : null,
    items,
    customCategories: [...new Set(customCategories)]
  };
}

export function applyOperations(currentValue, operations, now = new Date().toISOString()) {
  const state = normalizeState(currentValue);
  const itemsById = new Map(state.items.map((item) => [item.id, item]));
  const customCategories = new Set(state.customCategories);

  for (const operation of operations) {
    if (operation?.type === "upsert") {
      const item = normalizeItem(operation.item);
      if (!item) {
        throw new TypeError("Upsert operations require a valid item.");
      }

      itemsById.set(item.id, item);
      if (!BUILTIN_CATEGORIES.has(item.category)) {
        customCategories.add(item.category);
      }
      continue;
    }

    if (operation?.type === "delete") {
      const id = String(operation.id ?? "").trim();
      if (!id) {
        throw new TypeError("Delete operations require an item ID.");
      }

      itemsById.delete(id);
      continue;
    }

    throw new TypeError("Unsupported cupboard operation.");
  }

  return {
    version: state.version + 1,
    updatedAt: now,
    items: [...itemsById.values()],
    customCategories: [...customCategories]
  };
}
