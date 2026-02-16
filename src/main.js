import "./styles.css";
import { createClient } from "@supabase/supabase-js";

const STORAGE_KEY = "cupboard-app-state-v1";
const CLOUD_TABLE = "shared_cupboard_state";
const CLOUD_SYNC_DELAY_MS = 450;
const CLOUD_POLL_INTERVAL_MS = 7000;
const CLOUD_ROW_ID = import.meta.env.VITE_CLOUD_ROW_ID || "main";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
const NEW_ITEM_DEFAULT_LOW_LEVEL = "0";
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

const filterBar = document.querySelector("#filter-bar");
const searchPanel = document.querySelector("#search-panel");
const searchToggleButton = document.querySelector("#search-toggle-btn");
const clearSearchButton = document.querySelector("#clear-search-btn");
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
const deleteItemButton = document.querySelector("#delete-item-button");
const cancelEditButton = document.querySelector("#cancel-edit");
const editMessage = document.querySelector("#edit-message");
const undoToast = document.querySelector("#undo-toast");
const undoToastMessage = document.querySelector("#undo-toast-message");
const undoDeleteButton = document.querySelector("#undo-delete-button");
const searchInput = document.querySelector("#search-input");
const topAddButton = document.querySelector("#top-add-button");
const cloudStatusBadge = document.querySelector("#cloud-status-badge");
const cloudSyncNowButton = document.querySelector("#cloud-sync-now-button");

let state = loadState();
let editingItemId = null;
let searchQuery = "";
let searchOpen = false;
let activeFilter = "all";
let pendingDeletedItem = null;
let undoTimerId = null;
let cloudSyncTimerId = null;
let cloudSyncInFlight = false;
let cloudSyncQueued = false;
let cloudLastError = "";
let cloudPollIntervalId = null;
let lastCloudSignature = "";

const cloudClient =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

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

function formatQuantity(value) {
  return Number(value.toFixed(3)).toString();
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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

function normalizeStatePayload(parsed, fallbackItems) {
  const items = Array.isArray(parsed?.items)
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

  const customCategories = Array.isArray(parsed?.customCategories)
    ? parsed.customCategories.map((category) => String(category).trim()).filter(Boolean)
    : [];

  return {
    items,
    customCategories
  };
}

function stateSignature(sourceState) {
  const items = sourceState.items
    .map((item) => ({
      id: String(item.id),
      name: String(item.name),
      quantity: String(item.quantity),
      lowLevel: String(item.lowLevel),
      category: String(item.category)
    }))
    .sort((a, b) => {
      const byId = NAME_COLLATOR.compare(a.id, b.id);
      if (byId !== 0) {
        return byId;
      }
      const byName = NAME_COLLATOR.compare(a.name, b.name);
      if (byName !== 0) {
        return byName;
      }
      return NAME_COLLATOR.compare(a.category, b.category);
    });

  const customCategories = [...sourceState.customCategories].sort((a, b) =>
    NAME_COLLATOR.compare(a, b)
  );

  return JSON.stringify({
    items,
    customCategories
  });
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
    return normalizeStatePayload(parsed, fallbackItems);
  } catch {
    return {
      items: fallbackItems,
      customCategories: fallbackCategories.filter((c) => !BUILTIN_CATEGORIES.includes(c))
    };
  }
}

function saveStateLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveState() {
  saveStateLocal();
  scheduleCloudSync();
}

function allCategories() {
  const set = new Set([...BUILTIN_CATEGORIES, ...state.customCategories]);
  for (const item of state.items) {
    set.add(item.category);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function getFilteredItems() {
  const tokens = normalizeText(searchQuery)
    .split(/\s+/)
    .filter(Boolean);

  return state.items.filter((item) => {
    const matchesFilter =
      activeFilter === "all" ||
      (activeFilter === "low" && isLow(item)) ||
      item.category === activeFilter;
    if (tokens.length === 0) {
      return matchesFilter;
    }

    const haystack = normalizeText(`${item.name} ${item.category}`);
    return tokens.every((token) => haystack.includes(token));
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
  const options = [
    { value: "all", label: "All" },
    { value: "low", label: "Low" },
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

    button.addEventListener("click", () => {
      activeFilter = option.value;
      render();
    });

    filterBar.append(button);
  }
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
    return;
  }

  for (const group of groups) {
    const section = document.createElement("section");
    section.className = "category-section";

    const header = document.createElement("div");
    header.className = "category-header";

    const title = document.createElement("span");
    title.textContent = group.category;
    header.append(title);

    const listNode = document.createElement("div");
    listNode.className = "items-list";
    listNode.setAttribute("role", "list");

    for (const item of group.items) {
      const node = rowTemplate.content.firstElementChild.cloneNode(true);

      const nameCell = node.querySelector('[data-field="name"]');
      const qtyInput = node.querySelector('[data-field="quantity"]');
      const decreaseButton = node.querySelector('[data-action="decrease"]');
      const increaseButton = node.querySelector('[data-action="increase"]');
      const editButton = node.querySelector('[data-action="edit"]');

      nameCell.textContent = item.name;
      qtyInput.value = item.quantity;
      node.classList.toggle("low", isLow(item));

      qtyInput.addEventListener("change", () => {
        item.quantity = qtyInput.value.trim();
        saveState();
        render();
      });

      decreaseButton.addEventListener("click", () => {
        const current = toNumberOrNull(item.quantity) ?? 0;
        const next = Math.max(0, current - 1);
        item.quantity = formatQuantity(next);
        saveState();
        render();
      });

      increaseButton.addEventListener("click", () => {
        const current = toNumberOrNull(item.quantity) ?? 0;
        const next = current + 1;
        item.quantity = formatQuantity(next);
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
}

function setFormMessage(message, tone = "ok") {
  formMessage.textContent = message;
  formMessage.dataset.tone = tone;
}

function updateCloudBadge(mode, text) {
  cloudStatusBadge.classList.remove("syncing", "synced", "error");
  if (mode) {
    cloudStatusBadge.classList.add(mode);
  }
  cloudStatusBadge.textContent = text;
}

function updateCloudUI() {
  if (!cloudClient) {
    updateCloudBadge("", "Local only");
    cloudSyncNowButton.disabled = true;
    return;
  }

  cloudSyncNowButton.disabled = false;

  if (cloudSyncInFlight) {
    updateCloudBadge("syncing", "Syncing...");
  } else if (cloudLastError) {
    updateCloudBadge("error", "Cloud error");
  } else if (lastCloudSignature) {
    updateCloudBadge("synced", "Shared cloud");
  } else {
    updateCloudBadge("", "Cloud ready");
  }
}

function clearCloudTimer() {
  if (cloudSyncTimerId !== null) {
    window.clearTimeout(cloudSyncTimerId);
    cloudSyncTimerId = null;
  }
}

function clearCloudPolling() {
  if (cloudPollIntervalId !== null) {
    window.clearInterval(cloudPollIntervalId);
    cloudPollIntervalId = null;
  }
}

async function runCloudSync() {
  if (!cloudClient) {
    return;
  }

  if (cloudSyncInFlight) {
    cloudSyncQueued = true;
    return;
  }

  cloudSyncInFlight = true;
  updateCloudUI();

  try {
    const payload = JSON.parse(JSON.stringify(state));
    const { data, error } = await cloudClient
      .from(CLOUD_TABLE)
      .upsert(
      {
        id: CLOUD_ROW_ID,
        data: payload
      },
      {
        onConflict: "id"
      }
      )
      .select("data")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const remotePayload = data?.data ?? payload;
    const fallbackItems = normalizeInitialItems();
    const normalized = normalizeStatePayload(remotePayload, fallbackItems);
    lastCloudSignature = stateSignature(normalized);
    cloudLastError = "";
    updateCloudBadge("synced", "Shared cloud");
  } catch (error) {
    cloudLastError = error instanceof Error ? error.message : "Unknown cloud sync error";
    updateCloudBadge("error", "Cloud error");
  } finally {
    cloudSyncInFlight = false;
    updateCloudUI();
    if (cloudSyncQueued) {
      cloudSyncQueued = false;
      scheduleCloudSync();
    }
  }
}

function scheduleCloudSync() {
  if (!cloudClient) {
    return;
  }

  clearCloudTimer();
  cloudSyncTimerId = window.setTimeout(() => {
    cloudSyncTimerId = null;
    void runCloudSync();
  }, CLOUD_SYNC_DELAY_MS);
}

async function pullCloudState(options = {}) {
  if (!cloudClient) {
    return;
  }

  const seedIfMissing = Boolean(options.seedIfMissing);

  if (!cloudSyncInFlight) {
    updateCloudBadge("syncing", "Syncing...");
  }

  try {
    const { data, error } = await cloudClient
      .from(CLOUD_TABLE)
      .select("data")
      .eq("id", CLOUD_ROW_ID)
      .maybeSingle();

    if (error) {
      cloudLastError = error.message;
      updateCloudBadge("error", "Cloud error");
      return;
    }

    if (!data?.data) {
      if (seedIfMissing) {
        await runCloudSync();
      }
      return;
    }

    const fallbackItems = normalizeInitialItems();
    const remoteState = normalizeStatePayload(data.data, fallbackItems);
    const remoteSignature = stateSignature(remoteState);
    const localSignature = stateSignature(state);

    lastCloudSignature = remoteSignature;
    cloudLastError = "";

    if (remoteSignature !== localSignature) {
      state = remoteState;
      saveStateLocal();
      render();
      setFormMessage("Updated from shared cloud.", "ok");
    }

    updateCloudBadge("synced", "Shared cloud");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    cloudLastError = message;
    updateCloudBadge("error", "Cloud error");
  } finally {
    updateCloudUI();
  }
}

function startCloudPolling() {
  if (!cloudClient || cloudPollIntervalId !== null) {
    return;
  }

  cloudPollIntervalId = window.setInterval(() => {
    void pullCloudState();
  }, CLOUD_POLL_INTERVAL_MS);
}

async function initCloud() {
  updateCloudUI();

  if (!cloudClient) {
    setFormMessage("Ready. Local-only mode (cloud not configured).", "ok");
    return;
  }

  await pullCloudState({ seedIfMissing: true });
  startCloudPolling();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void pullCloudState();
    }
  });

  window.addEventListener("beforeunload", clearCloudPolling);
  setFormMessage("Ready. Shared cloud sync enabled.", "ok");
}

function clearUndoTimer() {
  if (undoTimerId !== null) {
    window.clearTimeout(undoTimerId);
    undoTimerId = null;
  }
}

function hideUndoToast(clearPending = true) {
  clearUndoTimer();
  undoToast.classList.remove("open");
  if (clearPending) {
    pendingDeletedItem = null;
  }
}

function showUndoToast(item, index) {
  hideUndoToast(false);
  pendingDeletedItem = { item, index };
  undoToastMessage.textContent = `Removed ${item.name}.`;
  undoToast.classList.add("open");
  undoTimerId = window.setTimeout(() => {
    hideUndoToast(true);
  }, 3000);
}

function restoreDeletedItem() {
  if (!pendingDeletedItem) {
    return;
  }

  const { item, index } = pendingDeletedItem;
  const insertAt = Math.max(0, Math.min(index, state.items.length));
  state.items.splice(insertAt, 0, item);

  if (!BUILTIN_CATEGORIES.includes(item.category) && !state.customCategories.includes(item.category)) {
    state.customCategories.push(item.category);
    state.customCategories.sort((a, b) => a.localeCompare(b));
  }

  saveState();
  hideUndoToast(true);
  render();
  setFormMessage(`Restored ${item.name}.`, "ok");
}

function syncSearchUI() {
  const hasQuery = searchQuery.trim().length > 0;
  searchPanel.classList.toggle("open", searchOpen);
  searchPanel.classList.toggle("has-query", hasQuery);
  searchToggleButton.classList.toggle("active", searchOpen || hasQuery);
  searchToggleButton.setAttribute("aria-expanded", searchOpen ? "true" : "false");
}

function setSearchOpen(open, options = {}) {
  searchOpen = open;
  syncSearchUI();

  if (open && options.focus) {
    window.setTimeout(() => {
      searchInput.focus();
    }, 120);
  }
}

function clearSearch() {
  searchQuery = "";
  searchInput.value = "";
  renderRows();
  syncSearchUI();
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

function deleteEditingItem() {
  if (!editingItemId) {
    return;
  }

  const itemIndex = state.items.findIndex((entry) => entry.id === editingItemId);
  if (itemIndex < 0) {
    closeEditDialog();
    return;
  }

  const [removedItem] = state.items.splice(itemIndex, 1);
  saveState();
  closeEditDialog();
  render();
  showUndoToast(removedItem, itemIndex);
  setFormMessage(`Removed ${removedItem.name}.`, "ok");
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
  newLowLevelInput.value = NEW_ITEM_DEFAULT_LOW_LEVEL;
  newCategorySelect.value = category;
  syncCustomCategoryInput();
  setFormMessage(`Added ${name}.`, "ok");
}

function wireEvents() {
  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value;
    renderRows();
    syncSearchUI();
  });
  searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (searchQuery.trim()) {
      clearSearch();
      return;
    }

    setSearchOpen(false);
  });
  searchToggleButton.addEventListener("click", () => {
    if (searchOpen) {
      clearSearch();
      setSearchOpen(false);
      return;
    }

    setSearchOpen(true, { focus: true });
  });
  clearSearchButton.addEventListener("click", () => {
    clearSearch();
    searchInput.focus();
  });
  topAddButton.addEventListener("click", () => {
    clearSearch();
    setSearchOpen(false);
    addSection.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      newNameInput.focus();
    }, 200);
  });
  cloudSyncNowButton.addEventListener("click", () => {
    void runCloudSync();
  });
  newCategorySelect.addEventListener("change", syncCustomCategoryInput);
  newItemForm.addEventListener("submit", addItemFromForm);
  editCategorySelect.addEventListener("change", syncEditCustomCategoryInput);
  deleteItemButton.addEventListener("click", deleteEditingItem);
  editItemForm.addEventListener("submit", saveEditedItem);
  cancelEditButton.addEventListener("click", closeEditDialog);
  undoDeleteButton.addEventListener("click", restoreDeletedItem);
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
  syncSearchUI();
}

newLowLevelInput.value = NEW_ITEM_DEFAULT_LOW_LEVEL;
wireEvents();
render();
setFormMessage("Ready.");
void initCloud();
