import "./styles.css";

const STORAGE_KEY = "cupboard-app-state-v1";

const SEED_ITEMS = [
  { name: "Arribato rice", quantity: "1.25", category: "Grains & Pasta" },
  { name: "Microwave rice", quantity: "2", category: "Grains & Pasta" },
  { name: "Couscous", quantity: "2", category: "Grains & Pasta" },
  { name: "Penne Pasta", quantity: "1", category: "Grains & Pasta" },
  { name: "Rigatoni", quantity: "0.5", category: "Other" },
  { name: "Medium egg noodles", quantity: "0.5", category: "Grains & Pasta" },
  { name: "Risotto truffle kit", quantity: "1", category: "Grains & Pasta" },
  { name: "Miso paste", quantity: "1", category: "Spices & Seasonings" },
  { name: "Capsicana hot honey", quantity: "1", category: "Sauces & Condiments" },
  { name: "Garlic seasoning bag", quantity: "1", category: "Spices & Seasonings" },
  { name: "BBQ seasoning bag", quantity: "1", category: "Spices & Seasonings" },
  { name: "Lentil vertes", quantity: "1", category: "Legumes & Flours" },
  { name: "Red lentils", quantity: "1", category: "Legumes & Flours" },
  { name: "Gram flour", quantity: "1", category: "Legumes & Flours" },
  { name: "Hoisin sauce", quantity: "1", category: "Sauces & Condiments" },
  { name: "Sweet hoisin sauce", quantity: "1", category: "Sauces & Condiments" },
  { name: "Texas BBQ sauce", quantity: "1.25", category: "Sauces & Condiments" },
  { name: "Korean hot sauce", quantity: "1", category: "Sauces & Condiments" },
  { name: "Caramel sauce", quantity: "1", category: "Sauces & Condiments" },
  { name: "Kewpie", quantity: "1", category: "Sauces & Condiments" },
  { name: "Peanut butter", quantity: "2", category: "Canned Goods" },
  { name: "Chilli paste", quantity: "1", category: "Sauces & Condiments" },
  { name: "Mustard", quantity: "1", category: "Sauces & Condiments" },
  { name: "Grainy mustard", quantity: "1", category: "Sauces & Condiments" },
  { name: "Chicken korma paste", quantity: "1", category: "Sauces & Condiments" },
  { name: "Cuppa soup chicken", quantity: "2", category: "Canned Goods" },
  { name: "Bread crumbs", quantity: "1", category: "Canned Goods" },
  { name: "Chickpeas", quantity: "1", category: "Legumes & Flours" },
  { name: "Red cabbage jar", quantity: "1", category: "Canned Goods" },
  { name: "Gherkins", quantity: "1", category: "Canned Goods" },
  { name: "Black beans", quantity: "4", category: "Canned Goods" },
  { name: "Chopped tomatoes", quantity: "1", category: "Canned Goods" },
  { name: "Coconut cream", quantity: "2", category: "Canned Goods" },
  { name: "Peach slices", quantity: "1", category: "Canned Goods" },
  { name: "Tuna tin", quantity: "1", category: "Canned Goods" },
  { name: "Baked beans", quantity: "1", category: "Canned Goods" },
  { name: "Chicken gravy granules", quantity: "1", category: "Stock & Gravy" },
  { name: "Vegan gravy granules", quantity: "1", category: "Stock & Gravy" },
  { name: "Chicken stock", quantity: "1", category: "Stock & Gravy" },
  { name: "Vegetable stock", quantity: "1", category: "Stock & Gravy" },
  { name: "Beef stock", quantity: "1", category: "Stock & Gravy" }
];

const DEFAULT_LOW_LEVEL = "1";
const BUILTIN_CATEGORIES = [
  "Canned Goods",
  "Grains & Pasta",
  "Legumes & Flours",
  "Sauces & Condiments",
  "Spices & Seasonings",
  "Stock & Gravy",
  "Other"
];
const NAME_COLLATOR = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true
});

const summaryEl = document.querySelector("#summary");
const itemsBody = document.querySelector("#items-body");
const rowTemplate = document.querySelector("#row-template");
const newItemForm = document.querySelector("#new-item-form");
const formMessage = document.querySelector("#form-message");
const newNameInput = document.querySelector("#new-name");
const newQuantityInput = document.querySelector("#new-quantity");
const newLowLevelInput = document.querySelector("#new-low-level");
const newCategorySelect = document.querySelector("#new-category-select");
const newCustomCategoryWrap = document.querySelector("#new-custom-category-wrap");
const newCustomCategoryInput = document.querySelector("#new-custom-category");
const editDialog = document.querySelector("#edit-dialog");
const editItemForm = document.querySelector("#edit-item-form");
const editNameInput = document.querySelector("#edit-name");
const editLowLevelInput = document.querySelector("#edit-low-level");
const editCategorySelect = document.querySelector("#edit-category-select");
const editCustomCategoryWrap = document.querySelector("#edit-custom-category-wrap");
const editCustomCategoryInput = document.querySelector("#edit-custom-category");
const cancelEditButton = document.querySelector("#cancel-edit");
const editMessage = document.querySelector("#edit-message");
const undoToast = document.querySelector("#undo-toast");
const undoText = document.querySelector("#undo-text");
const undoButton = document.querySelector("#undo-button");

let state = loadState();
let editingItemId = null;
let pendingRemoval = null;

function createId() {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toNumberOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim().replace(",", ".");
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isLow(item) {
  const quantity = toNumberOrNull(item.quantity);
  const lowLevel = toNumberOrNull(item.lowLevel);

  if (quantity === null || lowLevel === null) {
    return false;
  }

  return quantity <= lowLevel;
}

function hasValidLevels(item) {
  return toNumberOrNull(item.quantity) !== null && toNumberOrNull(item.lowLevel) !== null;
}

function normalizeInitialItems() {
  return SEED_ITEMS.map((item) => ({
    id: createId(),
    name: item.name,
    quantity: item.quantity,
    lowLevel: DEFAULT_LOW_LEVEL,
    category: item.category
  }));
}

function baseCategories(items) {
  const set = new Set(BUILTIN_CATEGORIES);
  for (const item of items) {
    set.add(item.category);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function loadState() {
  const fallbackItems = normalizeInitialItems();
  const fallbackCategories = baseCategories(fallbackItems);

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        items: fallbackItems,
        customCategories: fallbackCategories.filter((c) => !BUILTIN_CATEGORIES.includes(c))
      };
    }

    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed.items)
      ? parsed.items
          .filter((item) => item && item.name && item.category)
          .map((item) => ({
            id: item.id || createId(),
            name: String(item.name).trim(),
            quantity: String(item.quantity ?? ""),
            lowLevel: String(item.lowLevel ?? DEFAULT_LOW_LEVEL),
            category: String(item.category).trim()
          }))
      : fallbackItems;

    const customCategories = Array.isArray(parsed.customCategories)
      ? parsed.customCategories.map((category) => String(category).trim()).filter(Boolean)
      : [];

    return {
      items,
      customCategories
    };
  } catch {
    return {
      items: fallbackItems,
      customCategories: fallbackCategories.filter((c) => !BUILTIN_CATEGORIES.includes(c))
    };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function allCategories() {
  const set = new Set([...BUILTIN_CATEGORIES, ...state.customCategories]);
  for (const item of state.items) {
    set.add(item.category);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function filteredAndSortedItems() {
  let list = state.items.slice();
  list.sort((a, b) => {
    const byName = NAME_COLLATOR.compare(a.name.trim(), b.name.trim());
    if (byName !== 0) {
      return byName;
    }

    const byCategory = NAME_COLLATOR.compare(a.category.trim(), b.category.trim());
    if (byCategory !== 0) {
      return byCategory;
    }

    return NAME_COLLATOR.compare(a.id, b.id);
  });

  return list;
}

function populateCategorySelect(select, previousValue) {
  const categories = allCategories();
  select.innerHTML = "";

  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.append(option);
  }

  const customOption = document.createElement("option");
  customOption.value = "__custom__";
  customOption.textContent = "+ Create new category";
  select.append(customOption);

  if (previousValue && [...select.options].some((option) => option.value === previousValue)) {
    select.value = previousValue;
  }
}

function renderCategoryControls() {
  populateCategorySelect(newCategorySelect, newCategorySelect.value);
  populateCategorySelect(editCategorySelect, editCategorySelect.value);
}

function statusText(item) {
  if (!hasValidLevels(item)) {
    return "Check values";
  }
  return isLow(item) ? "Running low" : "In stock";
}

function renderSummary() {
  const lowCount = state.items.filter((item) => isLow(item)).length;
  summaryEl.textContent = `${state.items.length} items • ${lowCount} low`;
}

function renderRows() {
  const list = filteredAndSortedItems();
  itemsBody.innerHTML = "";

  if (list.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "No items yet. Add your first cupboard item below.";
    itemsBody.append(emptyState);
    renderSummary();
    return;
  }

  for (const item of list) {
    const node = rowTemplate.content.firstElementChild.cloneNode(true);

    const nameCell = node.querySelector('[data-field="name"]');
    const categoryCell = node.querySelector('[data-field="category"]');
    const qtyInput = node.querySelector('[data-field="quantity"]');
    const statusCell = node.querySelector('[data-field="status"]');
    const editButton = node.querySelector('[data-action="edit"]');
    const deleteButton = node.querySelector('[data-action="delete"]');

    nameCell.textContent = item.name;
    categoryCell.textContent = item.category;
    qtyInput.value = item.quantity;
    statusCell.textContent = statusText(item);
    node.classList.toggle("low", isLow(item));
    if (!hasValidLevels(item)) {
      statusCell.className = "item-status status-warn";
    } else {
      statusCell.className = isLow(item)
        ? "item-status status-low"
        : "item-status status-ok";
    }

    qtyInput.addEventListener("change", () => {
      item.quantity = qtyInput.value.trim();
      saveState();
      render();
    });

    editButton.addEventListener("click", () => {
      openEditDialog(item.id);
    });

    deleteButton.addEventListener("click", () => {
      const index = state.items.findIndex((entry) => entry.id === item.id);
      if (index === -1) {
        return;
      }

      const [removedItem] = state.items.splice(index, 1);
      saveState();
      render();
      queueRemovalUndo(removedItem, index);
    });

    itemsBody.append(node);
  }

  renderSummary();
}

function setFormMessage(message, tone = "ok") {
  formMessage.textContent = message;
  formMessage.dataset.tone = tone;
}

function hideUndoToast() {
  undoToast.classList.remove("show");
  undoToast.setAttribute("aria-hidden", "true");
}

function dismissPendingRemoval() {
  if (!pendingRemoval) {
    return;
  }

  window.clearTimeout(pendingRemoval.timerId);
  pendingRemoval = null;
  hideUndoToast();
}

function queueRemovalUndo(item, index) {
  dismissPendingRemoval();

  undoText.textContent = `Removed ${item.name}.`;
  undoToast.classList.add("show");
  undoToast.setAttribute("aria-hidden", "false");

  const timerId = window.setTimeout(() => {
    pendingRemoval = null;
    hideUndoToast();
  }, 5000);

  pendingRemoval = {
    item,
    index,
    timerId
  };
}

function undoLastRemoval() {
  if (!pendingRemoval) {
    return;
  }

  const { item, index, timerId } = pendingRemoval;
  window.clearTimeout(timerId);
  pendingRemoval = null;

  const safeIndex = Math.max(0, Math.min(index, state.items.length));
  state.items.splice(safeIndex, 0, item);

  saveState();
  hideUndoToast();
  render();
  setFormMessage(`Restored ${item.name}.`, "ok");
}

function syncCustomCategoryInput() {
  const customMode = newCategorySelect.value === "__custom__";
  newCustomCategoryWrap.classList.toggle("hidden", !customMode);
  newCustomCategoryInput.required = customMode;
  if (customMode) {
    newCustomCategoryInput.focus();
  }
}

function setEditMessage(message, tone = "ok") {
  editMessage.textContent = message;
  editMessage.dataset.tone = tone;
}

function syncEditCustomCategoryInput() {
  const customMode = editCategorySelect.value === "__custom__";
  editCustomCategoryWrap.classList.toggle("hidden", !customMode);
  editCustomCategoryInput.required = customMode;
  if (!customMode) {
    editCustomCategoryInput.value = "";
  }
}

function openEditDialog(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) {
    return;
  }

  editingItemId = itemId;
  renderCategoryControls();

  editNameInput.value = item.name;
  editLowLevelInput.value = item.lowLevel;
  editCategorySelect.value = item.category;
  editCustomCategoryInput.value = "";
  syncEditCustomCategoryInput();
  setEditMessage("Update details and save.");

  if (typeof editDialog.showModal === "function") {
    editDialog.showModal();
  } else {
    editDialog.setAttribute("open", "");
  }
}

function closeEditDialog() {
  editingItemId = null;
  if (typeof editDialog.close === "function") {
    editDialog.close();
  } else {
    editDialog.removeAttribute("open");
  }
}

function saveEditedItem(event) {
  event.preventDefault();

  if (!editingItemId) {
    return;
  }

  const item = state.items.find((entry) => entry.id === editingItemId);
  if (!item) {
    closeEditDialog();
    return;
  }

  const name = editNameInput.value.trim();
  const lowLevel = editLowLevelInput.value.trim();
  const selectedCategory = editCategorySelect.value;
  const customCategory = editCustomCategoryInput.value.trim();
  const category = selectedCategory === "__custom__" ? customCategory : selectedCategory;

  if (!name || !lowLevel || !category) {
    setEditMessage("Please complete all fields.", "error");
    return;
  }

  if (toNumberOrNull(lowLevel) === null) {
    setEditMessage("Running low level must be a number.", "error");
    return;
  }

  const duplicate = state.items.some(
    (entry) =>
      entry.id !== item.id &&
      entry.name.toLowerCase() === name.toLowerCase() &&
      entry.category.toLowerCase() === category.toLowerCase()
  );

  if (duplicate) {
    setEditMessage("That item already exists in this category.", "error");
    return;
  }

  item.name = name;
  item.lowLevel = lowLevel;
  item.category = category;

  if (!BUILTIN_CATEGORIES.includes(category) && !state.customCategories.includes(category)) {
    state.customCategories.push(category);
    state.customCategories.sort((a, b) => a.localeCompare(b));
  }

  saveState();
  closeEditDialog();
  render();
  setFormMessage(`Updated ${name}.`, "ok");
}

function addItemFromForm(event) {
  event.preventDefault();

  const name = newNameInput.value.trim();
  const quantity = newQuantityInput.value.trim();
  const lowLevel = newLowLevelInput.value.trim();
  const selectedCategory = newCategorySelect.value;
  const customCategory = newCustomCategoryInput.value.trim();

  let category = selectedCategory;
  if (selectedCategory === "__custom__") {
    category = customCategory;
  }

  if (!name || !quantity || !lowLevel || !category) {
    setFormMessage("Please complete all fields.", "error");
    return;
  }

  if (toNumberOrNull(quantity) === null || toNumberOrNull(lowLevel) === null) {
    setFormMessage("Quantity and low level must be numbers.", "error");
    return;
  }

  const duplicate = state.items.some(
    (item) => item.name.toLowerCase() === name.toLowerCase() && item.category.toLowerCase() === category.toLowerCase()
  );

  if (duplicate) {
    setFormMessage("That item already exists in this category.", "error");
    return;
  }

  state.items.push({
    id: createId(),
    name,
    quantity,
    lowLevel,
    category
  });

  if (!BUILTIN_CATEGORIES.includes(category) && !state.customCategories.includes(category)) {
    state.customCategories.push(category);
    state.customCategories.sort((a, b) => a.localeCompare(b));
  }

  saveState();
  renderCategoryControls();
  renderRows();

  newItemForm.reset();
  newLowLevelInput.value = DEFAULT_LOW_LEVEL;
  newCategorySelect.value = category;
  syncCustomCategoryInput();
  setFormMessage(`Added ${name}.`, "ok");
}

function wireEvents() {
  newCategorySelect.addEventListener("change", syncCustomCategoryInput);
  newItemForm.addEventListener("submit", addItemFromForm);
  editCategorySelect.addEventListener("change", syncEditCustomCategoryInput);
  editItemForm.addEventListener("submit", saveEditedItem);
  cancelEditButton.addEventListener("click", closeEditDialog);
  undoButton.addEventListener("click", undoLastRemoval);
  editDialog.addEventListener("cancel", () => {
    editingItemId = null;
  });
  editDialog.addEventListener("click", (event) => {
    if (event.target === editDialog) {
      closeEditDialog();
    }
  });
}

function render() {
  renderCategoryControls();
  syncCustomCategoryInput();
  syncEditCustomCategoryInput();
  renderRows();
}

newLowLevelInput.value = DEFAULT_LOW_LEVEL;
wireEvents();
render();
hideUndoToast();
setFormMessage("Ready.");
