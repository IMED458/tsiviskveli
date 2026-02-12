const STORAGE_KEY = "cheese_inventory_v1";

const DEFAULT_PRODUCTS = [
  { name: "სულგუნი" },
  { name: "იმერული" },
  { name: "შებოლილი სულგუნი" },
  { name: "სკამორცა" },
  { name: "ტომი" }
];

const DEFAULT_EMPLOYEES = [
  { firstName: "ნიკა", lastName: "ღაღაშვილი", code: "1" }
];

const state = {
  data: null,
  currentView: "stock",
  role: "user",
  selectedOperationType: "შეტანა",
  selectedStorage: "ბოქსი",
  pendingOperation: null,
  operationInProgress: false,
  search: "",
  filters: {
    product: "",
    employee: "",
    type: "",
    storage: "",
    dateFrom: "",
    dateTo: ""
  },
  deleteTarget: null,
  editTarget: null
};

function genId(prefix) {
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${id}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeKg(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(3));
}

function formatKg(value) {
  return `${normalizeKg(value).toFixed(2)} კგ`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function seedData() {
  const createdAt = nowIso();
  return {
    version: 1,
    processedOperationIds: [],
    products: DEFAULT_PRODUCTS.map((p) => ({
      id: genId("prd"),
      name: p.name,
      stocks: {
        box: 0,
        twoSpace: 0
      },
      createdAt,
      updatedAt: createdAt
    })),
    employees: DEFAULT_EMPLOYEES.map((e) => ({
      id: genId("emp"),
      firstName: e.firstName,
      lastName: e.lastName,
      code: e.code,
      createdAt
    })),
    logs: []
  };
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = seedData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.products || !parsed.employees || !parsed.logs) {
      throw new Error("დაზიანებული მონაცემები");
    }
    parsed.processedOperationIds = parsed.processedOperationIds || [];
    return parsed;
  } catch (error) {
    const seeded = seedData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

function saveData(nextData) {
  state.data = nextData;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  const content = document.getElementById("toast-content");
  content.textContent = message;
  content.className = "mx-auto max-w-md rounded-xl px-4 py-3 text-center font-semibold text-white shadow-lg";
  if (type === "error") {
    content.classList.add("bg-red-600");
  } else if (type === "info") {
    content.classList.add("bg-blue-600");
  } else {
    content.classList.add("bg-emerald-600");
  }
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2600);
}

function getProductById(id) {
  return state.data.products.find((p) => p.id === id);
}

function getEmployeeByCode(code) {
  return state.data.employees.find((e) => e.code.toLowerCase() === code.toLowerCase());
}

function fullName(emp) {
  return `${emp.firstName} ${emp.lastName}`;
}

function setRole(role) {
  state.role = role;
  const badge = document.getElementById("role-badge");
  const adminNav = document.getElementById("admin-nav");
  const toggleBtn = document.getElementById("role-toggle-btn");

  if (role === "admin") {
    badge.textContent = "რეჟიმი: ადმინი";
    badge.className = "rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700";
    toggleBtn.textContent = "მომხმარებლის რეჟიმი";
    adminNav.classList.remove("hidden");
  } else {
    badge.textContent = "რეჟიმი: მომხმარებელი";
    badge.className = "rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700";
    toggleBtn.textContent = "ადმინ რეჟიმი";
    adminNav.classList.add("hidden");
    if (state.currentView === "admin") {
      setView("stock");
    }
  }
}

function setView(viewName) {
  state.currentView = viewName;
  document.querySelectorAll(".view-panel").forEach((panel) => panel.classList.add("hidden"));
  const panel = document.getElementById(`${viewName}-view`);
  if (panel) panel.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.remove("bg-blue-50", "text-blue-700");
    btn.classList.add("text-slate-600");
  });
  const active = document.querySelector(`.nav-btn[data-view=\"${viewName}\"]`);
  if (active) {
    active.classList.add("bg-blue-50", "text-blue-700");
    active.classList.remove("text-slate-600");
  }

  renderCurrentView();
}

function renderSummaryCards(filteredProducts) {
  const boxTotal = filteredProducts.reduce((sum, p) => sum + normalizeKg(p.stocks.box), 0);
  const twoTotal = filteredProducts.reduce((sum, p) => sum + normalizeKg(p.stocks.twoSpace), 0);
  const overall = boxTotal + twoTotal;

  document.getElementById("stock-summary").innerHTML = `
    <div class="rounded-2xl bg-blue-600 p-4 text-white shadow-sm">
      <p class="text-xs font-semibold uppercase">ბოქსი</p>
      <p class="mt-1 text-2xl font-extrabold">${formatKg(boxTotal)}</p>
    </div>
    <div class="rounded-2xl bg-indigo-600 p-4 text-white shadow-sm">
      <p class="text-xs font-semibold uppercase">ორ სივრციანი</p>
      <p class="mt-1 text-2xl font-extrabold">${formatKg(twoTotal)}</p>
    </div>
    <div class="rounded-2xl bg-emerald-600 p-4 text-white shadow-sm">
      <p class="text-xs font-semibold uppercase">სულ ჯამი</p>
      <p class="mt-1 text-2xl font-extrabold">${formatKg(overall)}</p>
    </div>
  `;
}

function renderStockView() {
  const q = state.search.trim().toLowerCase();
  const filtered = state.data.products.filter((p) => p.name.toLowerCase().includes(q));
  renderSummaryCards(filtered);

  const list = document.getElementById("stock-list");
  const empty = document.getElementById("stock-empty");

  if (!filtered.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");

  list.innerHTML = filtered
    .map((p) => {
      const box = normalizeKg(p.stocks.box);
      const two = normalizeKg(p.stocks.twoSpace);
      const total = box + two;
      return `
      <article class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="mb-3 flex items-start justify-between gap-3">
          <h3 class="text-lg font-extrabold text-slate-800">🧀 ${escapeHtml(p.name)}</h3>
          <span class="rounded-lg bg-slate-100 px-2 py-1 text-sm font-bold text-slate-700">${formatKg(total)}</span>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div class="rounded-xl bg-blue-50 p-3 text-center">
            <p class="text-xs font-semibold text-slate-500">📦 ბოქსი</p>
            <p class="text-lg font-extrabold text-blue-700">${formatKg(box)}</p>
          </div>
          <div class="rounded-xl bg-indigo-50 p-3 text-center">
            <p class="text-xs font-semibold text-slate-500">🏠 ორ სივრციანი</p>
            <p class="text-lg font-extrabold text-indigo-700">${formatKg(two)}</p>
          </div>
        </div>
      </article>
    `;
    })
    .join("");
}

function refreshProductDropdown() {
  const select = document.getElementById("op-product");
  const current = select.value;
  select.innerHTML = `<option value="">აირჩიეთ პროდუქტი</option>${state.data.products
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join("")}`;
  if (state.data.products.some((p) => p.id === current)) {
    select.value = current;
  }
}

function refreshLogFilters() {
  const productFilter = document.getElementById("filter-product");
  const employeeFilter = document.getElementById("filter-employee");
  const productValue = state.filters.product;
  const employeeValue = state.filters.employee;

  productFilter.innerHTML = `<option value="">ყველა პროდუქტი</option>${state.data.products
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join("")}`;
  employeeFilter.innerHTML = `<option value="">ყველა თანამშრომელი</option>${state.data.employees
    .map((e) => `<option value="${e.id}">${escapeHtml(fullName(e))}</option>`)
    .join("")}`;

  if (state.data.products.some((p) => p.id === productValue)) productFilter.value = productValue;
  if (state.data.employees.some((e) => e.id === employeeValue)) employeeFilter.value = employeeValue;
}

function updateCurrentStockCard() {
  const productId = document.getElementById("op-product").value;
  const card = document.getElementById("current-stock-card");
  const value = document.getElementById("current-stock-value");
  if (!productId) {
    card.classList.add("hidden");
    return;
  }
  const product = getProductById(productId);
  if (!product) {
    card.classList.add("hidden");
    return;
  }
  const stock = state.selectedStorage === "ბოქსი" ? product.stocks.box : product.stocks.twoSpace;
  value.textContent = formatKg(stock);
  card.classList.remove("hidden");
}

function renderOperationView() {
  refreshProductDropdown();
  updateCurrentStockCard();
}

function logPassesFilters(log) {
  if (state.filters.product && log.productId !== state.filters.product) return false;
  if (state.filters.employee && log.employeeId !== state.filters.employee) return false;
  if (state.filters.type && log.operationType !== state.filters.type) return false;
  if (state.filters.storage && log.storage !== state.filters.storage) return false;

  const day = log.timestamp.slice(0, 10);
  if (state.filters.dateFrom && day < state.filters.dateFrom) return false;
  if (state.filters.dateTo && day > state.filters.dateTo) return false;

  return true;
}

function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString("ka-GE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

function renderLogView() {
  refreshLogFilters();
  const list = document.getElementById("log-list");
  const empty = document.getElementById("log-empty");

  const filtered = [...state.data.logs].filter(logPassesFilters).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (!filtered.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  list.innerHTML = filtered
    .map((log) => {
      const isIn = log.operationType === "შეტანა";
      return `
      <article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="mb-2 flex items-start justify-between gap-2">
          <div>
            <p class="text-xs text-slate-500">${formatDateTime(log.timestamp)}</p>
            <p class="font-bold text-slate-800">${escapeHtml(log.employeeName)}</p>
          </div>
          <span class="rounded-full px-3 py-1 text-xs font-bold ${isIn ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}">
            ${isIn ? "📥 შეტანა" : "📤 გატანა"}
          </span>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <span>🧀 ${escapeHtml(log.productName)}</span>
          <span class="rounded bg-slate-100 px-2 py-0.5">${escapeHtml(log.storage)}</span>
          <span class="font-extrabold ${isIn ? "text-emerald-700" : "text-orange-700"}">${isIn ? "+" : "-"}${formatKg(log.quantityKg)}</span>
        </div>
        ${log.comment ? `<p class="mt-2 text-xs italic text-slate-500">💬 ${escapeHtml(log.comment)}</p>` : ""}
      </article>
    `;
    })
    .join("");
}

function renderProductsAdmin() {
  const container = document.getElementById("products-admin-list");
  if (!state.data.products.length) {
    container.innerHTML = `<p class="rounded-xl bg-slate-100 p-3 text-center text-sm text-slate-500">პროდუქტები არ არის</p>`;
    return;
  }
  container.innerHTML = state.data.products
    .map(
      (p) => `
      <div class="flex items-center justify-between rounded-xl bg-slate-50 p-3">
        <span class="font-semibold text-slate-800">🧀 ${escapeHtml(p.name)}</span>
        <div class="flex gap-2">
          <button class="edit-product rounded-lg bg-blue-100 px-3 py-1.5 text-sm font-semibold text-blue-700" data-id="${p.id}">რედაქტირება</button>
          <button class="delete-product rounded-lg bg-red-100 px-3 py-1.5 text-sm font-semibold text-red-700" data-id="${p.id}">წაშლა</button>
        </div>
      </div>
    `
    )
    .join("");
}

function renderEmployeesAdmin() {
  const container = document.getElementById("employees-admin-list");
  if (!state.data.employees.length) {
    container.innerHTML = `<p class="rounded-xl bg-slate-100 p-3 text-center text-sm text-slate-500">თანამშრომლები არ არიან</p>`;
    return;
  }
  container.innerHTML = state.data.employees
    .map(
      (e) => `
      <div class="flex items-center justify-between rounded-xl bg-slate-50 p-3">
        <div>
          <p class="font-semibold text-slate-800">👤 ${escapeHtml(fullName(e))}</p>
          <p class="text-xs text-slate-500">კოდი: ${escapeHtml(e.code)}</p>
        </div>
        <div class="flex gap-2">
          <button class="edit-employee rounded-lg bg-blue-100 px-3 py-1.5 text-sm font-semibold text-blue-700" data-id="${e.id}">რედაქტირება</button>
          <button class="delete-employee rounded-lg bg-red-100 px-3 py-1.5 text-sm font-semibold text-red-700" data-id="${e.id}">წაშლა</button>
        </div>
      </div>
    `
    )
    .join("");
}

function renderAdminView() {
  renderProductsAdmin();
  renderEmployeesAdmin();
}

function renderCurrentView() {
  switch (state.currentView) {
    case "stock":
      renderStockView();
      break;
    case "operation":
      renderOperationView();
      break;
    case "log":
      renderLogView();
      break;
    case "admin":
      renderAdminView();
      break;
    default:
      renderStockView();
  }
}

function upsertProcessedOperationIds(ids, opId) {
  const next = [...ids, opId];
  return next.length > 2000 ? next.slice(next.length - 2000) : next;
}

function applyOperationAtomic({ operationId, productId, operationType, storage, quantityKg, employee, comment }) {
  const snapshot = loadData();
  if (snapshot.processedOperationIds.includes(operationId)) {
    return { ok: false, error: "ეს ოპერაცია უკვე დაფიქსირებულია" };
  }

  const productIndex = snapshot.products.findIndex((p) => p.id === productId);
  if (productIndex === -1) return { ok: false, error: "პროდუქტი ვერ მოიძებნა" };

  const product = snapshot.products[productIndex];
  const key = storage === "ბოქსი" ? "box" : "twoSpace";
  const current = normalizeKg(product.stocks[key]);
  const qty = normalizeKg(quantityKg);

  if (operationType === "გატანა" && qty > current) {
    return { ok: false, error: `არასაკმარისი მარაგი. ხელმისაწვდომია ${formatKg(current)}` };
  }

  const nextAmount = operationType === "შეტანა" ? current + qty : current - qty;
  const updatedProduct = {
    ...product,
    stocks: {
      ...product.stocks,
      [key]: normalizeKg(nextAmount)
    },
    updatedAt: nowIso()
  };

  snapshot.products[productIndex] = updatedProduct;
  snapshot.logs.push({
    id: genId("log"),
    operationId,
    timestamp: nowIso(),
    employeeId: employee.id,
    employeeName: fullName(employee),
    operationType,
    productId: product.id,
    productName: product.name,
    storage,
    quantityKg: qty,
    comment: comment || ""
  });

  snapshot.processedOperationIds = upsertProcessedOperationIds(snapshot.processedOperationIds, operationId);
  saveData(snapshot);
  return { ok: true };
}

function openCodeModal() {
  const productId = document.getElementById("op-product").value;
  const quantity = Number(document.getElementById("op-quantity").value);
  const comment = document.getElementById("op-comment").value.trim();

  if (!productId) {
    showToast("აირჩიეთ პროდუქტი", "error");
    return;
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    showToast("შეიყვანეთ სწორი რაოდენობა", "error");
    return;
  }

  const product = getProductById(productId);
  if (!product) {
    showToast("პროდუქტი ვერ მოიძებნა", "error");
    return;
  }

  const current = state.selectedStorage === "ბოქსი" ? product.stocks.box : product.stocks.twoSpace;
  if (state.selectedOperationType === "გატანა" && normalizeKg(quantity) > normalizeKg(current)) {
    showToast(`არასაკმარისი მარაგი. ხელმისაწვდომია ${formatKg(current)}`, "error");
    return;
  }

  state.pendingOperation = {
    operationId: genId("op"),
    productId,
    quantityKg: normalizeKg(quantity),
    comment,
    operationType: state.selectedOperationType,
    storage: state.selectedStorage
  };

  document.getElementById("code-input").value = "";
  document.getElementById("code-error").classList.add("hidden");
  document.getElementById("code-modal").classList.remove("hidden");
  document.getElementById("code-input").focus();
}

function closeCodeModal() {
  document.getElementById("code-modal").classList.add("hidden");
}

async function continueWithCode() {
  if (state.operationInProgress) return;
  const code = document.getElementById("code-input").value.trim();
  const error = document.getElementById("code-error");

  if (!code) {
    error.textContent = "შეიყვანეთ თანამშრომლის კოდი";
    error.classList.remove("hidden");
    return;
  }
  const employee = getEmployeeByCode(code);
  if (!employee) {
    error.textContent = "არასწორი კოდი. სცადეთ თავიდან";
    error.classList.remove("hidden");
    return;
  }
  if (!state.pendingOperation) {
    error.textContent = "ოპერაცია ვერ მოიძებნა";
    error.classList.remove("hidden");
    return;
  }

  state.operationInProgress = true;
  const btn = document.getElementById("code-continue");
  btn.disabled = true;
  btn.textContent = "მიმდინარეობს...";

  const result = applyOperationAtomic({ ...state.pendingOperation, employee });

  btn.disabled = false;
  btn.textContent = "გაგრძელება";
  state.operationInProgress = false;

  if (!result.ok) {
    error.textContent = result.error;
    error.classList.remove("hidden");
    return;
  }

  closeCodeModal();
  state.pendingOperation = null;

  document.getElementById("op-product").value = "";
  document.getElementById("op-quantity").value = "";
  document.getElementById("op-comment").value = "";
  updateCurrentStockCard();

  showToast("ოპერაცია წარმატებით დასრულდა");
  renderCurrentView();
}

function addProduct() {
  const input = document.getElementById("new-product");
  const name = input.value.trim();
  if (!name) {
    showToast("შეიყვანეთ პროდუქტის სახელი", "error");
    return;
  }

  const exists = state.data.products.some((p) => p.name.toLowerCase() === name.toLowerCase());
  if (exists) {
    showToast("ასეთი პროდუქტი უკვე არსებობს", "error");
    return;
  }

  const next = {
    ...state.data,
    products: [
      ...state.data.products,
      {
        id: genId("prd"),
        name,
        stocks: { box: 0, twoSpace: 0 },
        createdAt: nowIso(),
        updatedAt: nowIso()
      }
    ]
  };
  saveData(next);
  input.value = "";
  showToast("პროდუქტი დაემატა");
  refreshProductDropdown();
  renderCurrentView();
}

function addEmployee() {
  const first = document.getElementById("new-emp-first").value.trim();
  const last = document.getElementById("new-emp-last").value.trim();
  const code = document.getElementById("new-emp-code").value.trim();

  if (!first || !last || !code) {
    showToast("შეავსეთ ყველა ველი", "error");
    return;
  }

  const codeExists = state.data.employees.some((e) => e.code.toLowerCase() === code.toLowerCase());
  if (codeExists) {
    showToast("ეს კოდი უკვე გამოყენებულია", "error");
    return;
  }

  const next = {
    ...state.data,
    employees: [
      ...state.data.employees,
      {
        id: genId("emp"),
        firstName: first,
        lastName: last,
        code,
        createdAt: nowIso()
      }
    ]
  };

  saveData(next);
  document.getElementById("new-emp-first").value = "";
  document.getElementById("new-emp-last").value = "";
  document.getElementById("new-emp-code").value = "";
  showToast("თანამშრომელი დაემატა");
  renderCurrentView();
}

function openDeleteModal(target) {
  state.deleteTarget = target;
  const text = document.getElementById("delete-text");
  if (target.type === "product") {
    text.textContent = `ნამდვილად გსურთ პროდუქტის "${target.name}" წაშლა?`;
  } else {
    text.textContent = `ნამდვილად გსურთ თანამშრომლის "${target.name}" წაშლა?`;
  }
  document.getElementById("delete-modal").classList.remove("hidden");
}

function closeDeleteModal() {
  document.getElementById("delete-modal").classList.add("hidden");
  state.deleteTarget = null;
}

function deleteTargetEntity() {
  if (!state.deleteTarget) return;

  if (state.deleteTarget.type === "product") {
    const usedInLogs = state.data.logs.some((l) => l.productId === state.deleteTarget.id);
    if (usedInLogs) {
      showToast("პროდუქტი ლოგში გამოიყენება და წაშლა შეუძლებელია", "error");
      closeDeleteModal();
      return;
    }

    saveData({
      ...state.data,
      products: state.data.products.filter((p) => p.id !== state.deleteTarget.id)
    });
  } else {
    const usedInLogs = state.data.logs.some((l) => l.employeeId === state.deleteTarget.id);
    if (usedInLogs) {
      showToast("თანამშრომელი ლოგში გამოიყენება და წაშლა შეუძლებელია", "error");
      closeDeleteModal();
      return;
    }

    saveData({
      ...state.data,
      employees: state.data.employees.filter((e) => e.id !== state.deleteTarget.id)
    });
  }

  closeDeleteModal();
  showToast("ჩანაწერი წაიშალა");
  renderCurrentView();
}

function openEditModal(target) {
  state.editTarget = target;
  const title = document.getElementById("edit-modal-title");
  const fields = document.getElementById("edit-modal-fields");

  if (target.type === "product") {
    title.textContent = "პროდუქტის რედაქტირება";
    fields.innerHTML = `<input id="edit-product-name" type="text" class="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500" />`;
  } else {
    title.textContent = "თანამშრომლის რედაქტირება";
    fields.innerHTML = `
      <input id="edit-emp-first" type="text" class="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500" />
      <input id="edit-emp-last" type="text" class="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500" />
      <input id="edit-emp-code" type="text" class="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500" />
    `;
  }
  if (target.type === "product") {
    document.getElementById("edit-product-name").value = target.name;
  } else {
    document.getElementById("edit-emp-first").value = target.firstName;
    document.getElementById("edit-emp-last").value = target.lastName;
    document.getElementById("edit-emp-code").value = target.code;
  }

  document.getElementById("edit-modal").classList.remove("hidden");
}

function closeEditModal() {
  document.getElementById("edit-modal").classList.add("hidden");
  state.editTarget = null;
}

function saveEditModal() {
  if (!state.editTarget) return;

  if (state.editTarget.type === "product") {
    const name = document.getElementById("edit-product-name").value.trim();
    if (!name) {
      showToast("შეიყვანეთ პროდუქტის სახელი", "error");
      return;
    }

    const duplicate = state.data.products.some((p) => p.id !== state.editTarget.id && p.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      showToast("ასეთი სახელი უკვე არსებობს", "error");
      return;
    }

    saveData({
      ...state.data,
      products: state.data.products.map((p) =>
        p.id === state.editTarget.id ? { ...p, name, updatedAt: nowIso() } : p
      ),
      logs: state.data.logs.map((l) =>
        l.productId === state.editTarget.id ? { ...l, productName: name } : l
      )
    });
  } else {
    const firstName = document.getElementById("edit-emp-first").value.trim();
    const lastName = document.getElementById("edit-emp-last").value.trim();
    const code = document.getElementById("edit-emp-code").value.trim();

    if (!firstName || !lastName || !code) {
      showToast("შეავსეთ ყველა ველი", "error");
      return;
    }

    const duplicateCode = state.data.employees.some(
      (e) => e.id !== state.editTarget.id && e.code.toLowerCase() === code.toLowerCase()
    );
    if (duplicateCode) {
      showToast("ეს კოდი უკვე გამოყენებულია", "error");
      return;
    }

    const employeeName = `${firstName} ${lastName}`;
    saveData({
      ...state.data,
      employees: state.data.employees.map((e) =>
        e.id === state.editTarget.id ? { ...e, firstName, lastName, code } : e
      ),
      logs: state.data.logs.map((l) =>
        l.employeeId === state.editTarget.id ? { ...l, employeeName } : l
      )
    });
  }

  closeEditModal();
  showToast("ცვლილება შენახულია");
  renderCurrentView();
}

function bindOperationButtons() {
  document.querySelectorAll(".op-type-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedOperationType = btn.dataset.type;
      document.querySelectorAll(".op-type-btn").forEach((b) => {
        b.classList.remove("border-emerald-500", "bg-emerald-50", "text-emerald-700", "border-orange-500", "bg-orange-50", "text-orange-700");
        b.classList.add("border-slate-300", "bg-white", "text-slate-600");
      });
      if (state.selectedOperationType === "შეტანა") {
        btn.classList.add("border-emerald-500", "bg-emerald-50", "text-emerald-700");
      } else {
        btn.classList.add("border-orange-500", "bg-orange-50", "text-orange-700");
      }
      btn.classList.remove("border-slate-300", "bg-white", "text-slate-600");
      updateCurrentStockCard();
    });
  });

  document.querySelectorAll(".storage-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedStorage = btn.dataset.storage;
      document.querySelectorAll(".storage-btn").forEach((b) => {
        b.classList.remove("border-blue-500", "bg-blue-50", "text-blue-700", "border-indigo-500", "bg-indigo-50", "text-indigo-700");
        b.classList.add("border-slate-300", "bg-white", "text-slate-600");
      });
      if (state.selectedStorage === "ბოქსი") {
        btn.classList.add("border-blue-500", "bg-blue-50", "text-blue-700");
      } else {
        btn.classList.add("border-indigo-500", "bg-indigo-50", "text-indigo-700");
      }
      btn.classList.remove("border-slate-300", "bg-white", "text-slate-600");
      updateCurrentStockCard();
    });
  });
}

function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      if (view === "admin" && state.role !== "admin") return;
      setView(view);
    });
  });

  document.getElementById("role-toggle-btn").addEventListener("click", () => {
    setRole(state.role === "admin" ? "user" : "admin");
  });

  document.getElementById("stock-search").addEventListener("input", (e) => {
    state.search = e.target.value;
    renderStockView();
  });

  document.getElementById("op-product").addEventListener("change", updateCurrentStockCard);
  document.getElementById("op-submit-btn").addEventListener("click", openCodeModal);

  document.getElementById("code-cancel").addEventListener("click", () => {
    state.pendingOperation = null;
    closeCodeModal();
  });
  document.getElementById("code-continue").addEventListener("click", continueWithCode);
  document.getElementById("code-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") continueWithCode();
  });

  document.getElementById("add-product-btn").addEventListener("click", addProduct);
  document.getElementById("new-product").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addProduct();
  });

  document.getElementById("add-employee-btn").addEventListener("click", addEmployee);
  document.getElementById("new-emp-code").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addEmployee();
  });

  document.getElementById("products-admin-list").addEventListener("click", (e) => {
    const id = e.target.dataset.id;
    if (!id) return;

    if (e.target.classList.contains("edit-product")) {
      const product = getProductById(id);
      if (product) openEditModal({ type: "product", id: product.id, name: product.name });
    }
    if (e.target.classList.contains("delete-product")) {
      const product = getProductById(id);
      if (product) openDeleteModal({ type: "product", id: product.id, name: product.name });
    }
  });

  document.getElementById("employees-admin-list").addEventListener("click", (e) => {
    const id = e.target.dataset.id;
    if (!id) return;

    if (e.target.classList.contains("edit-employee")) {
      const emp = state.data.employees.find((x) => x.id === id);
      if (emp) openEditModal({ type: "employee", ...emp });
    }
    if (e.target.classList.contains("delete-employee")) {
      const emp = state.data.employees.find((x) => x.id === id);
      if (emp) openDeleteModal({ type: "employee", id: emp.id, name: fullName(emp) });
    }
  });

  document.getElementById("delete-cancel").addEventListener("click", closeDeleteModal);
  document.getElementById("delete-confirm").addEventListener("click", deleteTargetEntity);

  document.getElementById("edit-cancel").addEventListener("click", closeEditModal);
  document.getElementById("edit-save").addEventListener("click", saveEditModal);

  [
    ["filter-product", "product"],
    ["filter-employee", "employee"],
    ["filter-type", "type"],
    ["filter-storage", "storage"],
    ["filter-date-from", "dateFrom"],
    ["filter-date-to", "dateTo"]
  ].forEach(([id, key]) => {
    document.getElementById(id).addEventListener("change", (e) => {
      state.filters[key] = e.target.value;
      renderLogView();
    });
  });

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      state.data = loadData();
      renderCurrentView();
    }
  });

  bindOperationButtons();
}

function init() {
  state.data = loadData();
  bindEvents();
  setRole("user");
  setView("stock");
}

init();
