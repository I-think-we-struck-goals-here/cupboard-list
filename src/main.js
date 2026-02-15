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
const filterBar = document.querySelector("#filter-bar");
const itemsBody = document.querySelector("#items-body");
const rowTemplate = document.querySelector("#row-template");
const addSection = document.querySelector("#add-section");
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
const searchInput = document.querySelector("#search-input");
const fabAddButton = document.querySelector("#fab-add-button");

let state = loadState();
let editingItemId = null;
let searchQuery = "";
let activeFilter = "all";

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

function getFilteredItems() {
  const query = searchQuery.trim().toLowerCase();

  return state.items.filter((item) => {
    const matchesFilter =
      activeFilter === "all" ||
      (activeFilter === "low" && isLow(item)) ||
      item.category === activeFilter;

    if (!matchesFilter) {
      return false;
    }

    if (!query) {
      return true;
    }

    const name = item.name.toLowerCase();
    const category = item.category.toLowerCase();
    return name.includes(query) || category.includes(query);
  });
}

function groupedItems() {
  const grouped = new Map();

  for (const item of getFilteredItems()) {
    const category = item.category;
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category).push(item);
  }

  const sortedCategories = [...grouped.keys()].sort((a, b) =>
    NAME_COLLATOR.compare(a, b)
  );

  return sortedCategories.map((category) => {
    const items = grouped.get(category).slice().sort((a, b) => {
      const byName = NAME_COLLATOR.compare(a.name.trim(), b.name.trim());
      if (byName !== 0) {
        return byName;
      }
      return NAME_COLLATOR.compare(a.id, b.id);
    });

    return { category, items };
  });
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

function renderFilters() {
  const lowCount = state.items.filter((item) => isLow(item)).length;
  const options = [
    { value: "all", label: "All" },
    { value: "low", label: "Low", badge: lowCount > 0 ? String(lowCount) : "" },
    ...allCategories().map((category) => ({ value: category, label: category }))
  ];

  if (!options.some((option) => option.value === activeFilter)) {
    activeFilter = "all";
  }

  filterBar.innerHTML = "";

  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-chip${activeFilter === option.value ? " active" : ""}`;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", activeFilter === option.value ? "true" : "false");
    button.dataset.filter = option.value;

    const label = document.createElement("span");
    label.textContent = option.label;
    button.append(label);

    if (option.badge) {
      const badge = document.createElement("span");
      badge.className = "low-badge";
      badge.textContent = option.badge;
      button.append(badge);
    }

    button.addEventListener("click", () => {
      activeFilter = option.value;
      render();
    });

    filterBar.append(button);
  }
}

function renderSummary() {
  const lowCount = state.items.filter((item) => isLow(item)).length;
  summaryEl.textContent = `${state.items.length} items • ${lowCount} low`;
}

function renderRows() {
  const groups = groupedItems();
  itemsBody.innerHTML = "";

  if (groups.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = searchQuery
      ? "No items match your search."
      : "No items yet. Add your first cupboard item below.";
    itemsBody.append(emptyState);
    renderSummary();
    return;
  }

  for (const group of groups) {
    const section = document.createElement("section");
    section.className = "category-section";

    const header = document.createElement("div");
    header.className = "category-header";

    const title = document.createElement("span");
    title.textContent = group.category;

    const count = document.createElement("span");
    count.className = "category-count";
    count.textContent = `${group.items.length} item${group.items.length === 1 ? "" : "s"}`;

    header.append(title, count);

    const listNode = document.createElement("div");
    listNode.className = "items-list";
    listNode.setAttribute("role", "list");

    for (const item of group.items) {
      const node = rowTemplate.content.firstElementChild.cloneNode(true);

      const nameCell = node.querySelector('[data-field="name"]');
      const qtyInput = node.querySelector('[data-field="quantity"]');
      const editButton = node.querySelector('[data-action="edit"]');

      nameCell.textContent = item.name;
      qtyInput.value = item.quantity;
      node.classList.toggle("low", isLow(item));

      qtyInput.addEventListener("change", () => {
        item.quantity = qtyInput.value.trim();
        saveState();
        render();
      });

      editButton.addEventListener("click", () => {
        openEditDialog(item.id);
      });

      listNode.append(node);
    }

    section.append(header, listNode);
    itemsBody.append(section);
  }

  renderSummary();
}

function setFormMessage(message, tone = "ok") {
  formMessage.textContent = message;
  formMessage.dataset.tone = tone;
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
  render();

  newItemForm.reset();
  newLowLevelInput.value = DEFAULT_LOW_LEVEL;
  newCategorySelect.value = category;
  syncCustomCategoryInput();
  setFormMessage(`Added ${name}.`, "ok");
}

function wireEvents() {
  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value;
    renderRows();
  });
  fabAddButton.addEventListener("click", () => {
    addSection.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      newNameInput.focus();
    }, 200);
  });
  newCategorySelect.addEventListener("change", syncCustomCategoryInput);
  newItemForm.addEventListener("submit", addItemFromForm);
  editCategorySelect.addEventListener("change", syncEditCustomCategoryInput);
  editItemForm.addEventListener("submit", saveEditedItem);
  cancelEditButton.addEventListener("click", closeEditDialog);
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
  renderFilters();
  syncCustomCategoryInput();
  syncEditCustomCategoryInput();
  renderRows();
}

newLowLevelInput.value = DEFAULT_LOW_LEVEL;
wireEvents();
render();
setFormMessage("Ready.");
