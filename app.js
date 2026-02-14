import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAnalytics, isSupported as analyticsSupported } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  addDoc,
  getDoc,
  onSnapshot,
  runTransaction,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const DEFAULT_PRODUCTS = [
  { name: "სულგუნი" },
  { name: "იმერული" },
  { name: "შებოლილი სულგუნი" },
  { name: "სკამორცა" },
  { name: "ტომი" }
];

const DEFAULT_EMPLOYEES = [{ firstName: "ნიკა", lastName: "ღაღაშვილი", code: "1" }];
const ADMIN_SESSION_KEY = "cheese_inventory_admin_session_v1";
const ADMIN_PASSWORD = "tamuna1968110";

const firebaseConfig = {
  apiKey: "AIzaSyD8Nv1Cmqy-jwFqxAHQrdxD_TslkGdSRuI",
  authDomain: "tsiviskveli-96330.firebaseapp.com",
  projectId: "tsiviskveli-96330",
  storageBucket: "tsiviskveli-96330.firebasestorage.app",
  messagingSenderId: "964624790385",
  appId: "1:964624790385:web:4532aaded064991cfd7cd0",
  measurementId: "G-ZDD9ZWFKGK"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

analyticsSupported()
  .then((ok) => {
    if (ok) getAnalytics(app);
  })
  .catch(() => {
    // Analytics optional in this app.
  });

const state = {
  data: {
    products: [],
    employees: [],
    logs: []
  },
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
  editTarget: null,
  adminAuthenticated: false
};

const refs = {
  products: collection(db, "products"),
  employees: collection(db, "employees"),
  logs: collection(db, "logs"),
  operations: collection(db, "operations"),
  employeeCodes: collection(db, "employeeCodes"),
  metaBootstrap: doc(db, "meta", "bootstrap")
};

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
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeCode(code) {
  return String(code || "").trim().toLowerCase();
}

function generateOperationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `op_${crypto.randomUUID()}`;
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `op_${hex}`;
  }
  return `op_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function storageToKey(storage) {
  return storage === "ბოქსი" ? "boxStock" : "twoSpaceStock";
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

function requireAdmin(actionLabel = "ამ ქმედებას") {
  if (state.role === "admin" && state.adminAuthenticated) return true;
  showToast(`${actionLabel} შეუძლია მხოლოდ ადმინს`, "error");
  return false;
}

function persistAdminSession(enabled) {
  if (enabled) {
    localStorage.setItem(ADMIN_SESSION_KEY, "1");
  } else {
    localStorage.removeItem(ADMIN_SESSION_KEY);
  }
}

function hasAdminSession() {
  return localStorage.getItem(ADMIN_SESSION_KEY) === "1";
}

function getProductById(id) {
  return state.data.products.find((p) => p.id === id);
}

function getEmployeeById(id) {
  return state.data.employees.find((e) => e.id === id);
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

  const opSubmit = document.getElementById("op-submit-btn");
  if (opSubmit) {
    opSubmit.disabled = false;
    opSubmit.classList.remove("opacity-50", "cursor-not-allowed");
    opSubmit.textContent = "დადასტურება";
  }
}

function openAdminLoginModal() {
  document.getElementById("admin-password-input").value = "";
  document.getElementById("admin-password-error").classList.add("hidden");
  document.getElementById("admin-login-modal").classList.remove("hidden");
  document.getElementById("admin-password-input").focus();
}

function closeAdminLoginModal() {
  document.getElementById("admin-login-modal").classList.add("hidden");
}

function activateAdminSession() {
  state.adminAuthenticated = true;
  persistAdminSession(true);
  setRole("admin");
  showToast("ადმინ რეჟიმი ჩართულია");
}

function deactivateAdminSession() {
  state.adminAuthenticated = false;
  persistAdminSession(false);
  setRole("user");
  showToast("ადმინ რეჟიმი გამოირთო", "info");
}

function tryAdminLogin() {
  const password = document.getElementById("admin-password-input").value;
  const error = document.getElementById("admin-password-error");
  if (password !== ADMIN_PASSWORD) {
    error.textContent = "პაროლი არასწორია";
    error.classList.remove("hidden");
    return;
  }
  closeAdminLoginModal();
  activateAdminSession();
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

  const day = String(log.timestamp || "").slice(0, 10);
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
        ${state.role === "admin" ? `
        <div class="mt-3 flex gap-2">
          <button class="edit-log rounded-lg bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-700" data-id="${log.id}">ლოგის რედაქტირება</button>
          <button class="delete-log rounded-lg bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700" data-id="${log.id}">ლოგის წაშლა</button>
        </div>
        ` : ""}
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

async function ensureBootstrapData() {
  await runTransaction(db, async (tx) => {
    const bootstrapSnap = await tx.get(refs.metaBootstrap);
    if (bootstrapSnap.exists()) return;

    const ts = nowIso();
    for (const product of DEFAULT_PRODUCTS) {
      const productRef = doc(refs.products);
      tx.set(productRef, {
        name: product.name,
        nameLower: product.name.toLowerCase(),
        boxStock: 0,
        twoSpaceStock: 0,
        createdAt: ts,
        updatedAt: ts
      });
    }

    for (const employee of DEFAULT_EMPLOYEES) {
      const empRef = doc(refs.employees);
      const codeLower = normalizeCode(employee.code);
      const codeRef = doc(refs.employeeCodes, codeLower);
      tx.set(empRef, {
        firstName: employee.firstName,
        lastName: employee.lastName,
        code: employee.code,
        codeLower,
        createdAt: ts
      });
      tx.set(codeRef, {
        employeeId: empRef.id,
        code: employee.code,
        createdAt: ts
      });
    }

    tx.set(refs.metaBootstrap, {
      seeded: true,
      seededAt: ts
    });
  });
}

function startRealtimeListeners() {
  onSnapshot(refs.products, (snapshot) => {
    state.data.products = snapshot.docs
      .map((d) => ({
        id: d.id,
        name: d.data().name || "",
        stocks: {
          box: normalizeKg(d.data().boxStock || 0),
          twoSpace: normalizeKg(d.data().twoSpaceStock || 0)
        },
        createdAt: d.data().createdAt || "",
        updatedAt: d.data().updatedAt || ""
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ka"));
    renderCurrentView();
  });

  onSnapshot(refs.employees, (snapshot) => {
    state.data.employees = snapshot.docs
      .map((d) => ({
        id: d.id,
        firstName: d.data().firstName || "",
        lastName: d.data().lastName || "",
        code: d.data().code || "",
        codeLower: d.data().codeLower || ""
      }))
      .sort((a, b) => fullName(a).localeCompare(fullName(b), "ka"));
    renderCurrentView();
  });

  onSnapshot(refs.logs, (snapshot) => {
    state.data.logs = snapshot.docs
      .map((d) => ({
        id: d.id,
        operationId: d.data().operationId || "",
        timestamp: d.data().timestamp || "",
        employeeId: d.data().employeeId || "",
        employeeName: d.data().employeeName || "",
        operationType: d.data().operationType || "",
        productId: d.data().productId || "",
        productName: d.data().productName || "",
        storage: d.data().storage || "",
        quantityKg: normalizeKg(d.data().quantityKg || 0),
        comment: d.data().comment || ""
      }))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    renderCurrentView();
  });
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
    operationId: generateOperationId(),
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

async function performOperationWithTransaction({ operationId, productId, operationType, storage, quantityKg, comment, code }) {
  const codeLower = normalizeCode(code);
  const opRef = doc(refs.operations, operationId);
  const codeRef = doc(refs.employeeCodes, codeLower);
  const productRef = doc(refs.products, productId);

  await runTransaction(db, async (tx) => {
    const opSnap = await tx.get(opRef);
    if (opSnap.exists()) throw new Error("ეს ოპერაცია უკვე დაფიქსირებულია");

    const codeSnap = await tx.get(codeRef);
    if (!codeSnap.exists()) throw new Error("არასწორი კოდი. სცადეთ თავიდან");

    const employeeId = codeSnap.data().employeeId;
    const empRef = doc(refs.employees, employeeId);
    const empSnap = await tx.get(empRef);
    if (!empSnap.exists()) throw new Error("თანამშრომელი ვერ მოიძებნა");

    const productSnap = await tx.get(productRef);
    if (!productSnap.exists()) throw new Error("პროდუქტი ვერ მოიძებნა");

    const key = storage === "ბოქსი" ? "boxStock" : "twoSpaceStock";
    const currentStock = normalizeKg(productSnap.data()[key] || 0);
    const qty = normalizeKg(quantityKg);

    if (operationType === "გატანა" && qty > currentStock) {
      throw new Error(`არასაკმარისი მარაგი. ხელმისაწვდომია ${formatKg(currentStock)}`);
    }

    const nextAmount = operationType === "შეტანა" ? currentStock + qty : currentStock - qty;
    tx.update(productRef, {
      [key]: normalizeKg(nextAmount),
      updatedAt: nowIso()
    });

    const employeeName = `${empSnap.data().firstName} ${empSnap.data().lastName}`;
    const logRef = doc(refs.logs);
    tx.set(logRef, {
      operationId,
      timestamp: nowIso(),
      employeeId,
      employeeName,
      operationType,
      productId,
      productName: productSnap.data().name,
      storage,
      quantityKg: qty,
      comment: comment || "",
      createdAt: serverTimestamp()
    });

    tx.set(opRef, {
      createdAt: serverTimestamp(),
      timestamp: nowIso(),
      productId,
      operationType
    });
  });
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
  if (!state.pendingOperation) {
    error.textContent = "ოპერაცია ვერ მოიძებნა";
    error.classList.remove("hidden");
    return;
  }

  state.operationInProgress = true;
  const btn = document.getElementById("code-continue");
  btn.disabled = true;
  btn.textContent = "მიმდინარეობს...";

  try {
    await performOperationWithTransaction({ ...state.pendingOperation, code });
    closeCodeModal();
    state.pendingOperation = null;

    document.getElementById("op-product").value = "";
    document.getElementById("op-quantity").value = "";
    document.getElementById("op-comment").value = "";
    updateCurrentStockCard();

    showToast("ოპერაცია წარმატებით დასრულდა");
  } catch (e) {
    if (e && e.code === "permission-denied") {
      error.textContent = "წვდომა შეზღუდულია (Firestore Rules). გატანა/შეტანის ჩაწერა დაშვებული უნდა იყოს.";
    } else {
      error.textContent = e.message || "ოპერაციის შესრულება ვერ მოხერხდა";
    }
    error.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "გაგრძელება";
    state.operationInProgress = false;
  }
}

async function addProduct() {
  if (!requireAdmin("პროდუქტის დამატება")) return;

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

  await addDoc(refs.products, {
    name,
    nameLower: name.toLowerCase(),
    boxStock: 0,
    twoSpaceStock: 0,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  input.value = "";
  showToast("პროდუქტი დაემატა");
}

async function addEmployee() {
  if (!requireAdmin("თანამშრომლის დამატება")) return;

  const first = document.getElementById("new-emp-first").value.trim();
  const last = document.getElementById("new-emp-last").value.trim();
  const code = document.getElementById("new-emp-code").value.trim();

  if (!first || !last || !code) {
    showToast("შეავსეთ ყველა ველი", "error");
    return;
  }

  const codeLower = normalizeCode(code);

  try {
    await runTransaction(db, async (tx) => {
      const codeRef = doc(refs.employeeCodes, codeLower);
      const codeSnap = await tx.get(codeRef);
      if (codeSnap.exists()) throw new Error("ეს კოდი უკვე გამოყენებულია");

      const empRef = doc(refs.employees);
      tx.set(empRef, {
        firstName: first,
        lastName: last,
        code,
        codeLower,
        createdAt: nowIso()
      });

      tx.set(codeRef, {
        employeeId: empRef.id,
        code,
        createdAt: nowIso()
      });
    });

    document.getElementById("new-emp-first").value = "";
    document.getElementById("new-emp-last").value = "";
    document.getElementById("new-emp-code").value = "";
    showToast("თანამშრომელი დაემატა");
  } catch (e) {
    showToast(e.message || "თანამშრომლის დამატება ვერ მოხერხდა", "error");
  }
}

function openDeleteModal(target) {
  state.deleteTarget = target;
  const text = document.getElementById("delete-text");
  if (target.type === "product") {
    text.textContent = `ნამდვილად გსურთ პროდუქტის "${target.name}" წაშლა?`;
  } else if (target.type === "log") {
    text.textContent = "ნამდვილად გსურთ ამ ლოგის ჩანაწერის წაშლა?";
  } else {
    text.textContent = `ნამდვილად გსურთ თანამშრომლის "${target.name}" წაშლა?`;
  }
  document.getElementById("delete-modal").classList.remove("hidden");
}

function closeDeleteModal() {
  document.getElementById("delete-modal").classList.add("hidden");
  state.deleteTarget = null;
}

function openLogDeleteFinalModal() {
  document.getElementById("log-delete-final-modal").classList.remove("hidden");
}

function closeLogDeleteFinalModal() {
  document.getElementById("log-delete-final-modal").classList.add("hidden");
}

async function confirmLogDeleteFinal() {
  if (!requireAdmin("ლოგის წაშლა")) return;
  if (!state.deleteTarget || state.deleteTarget.type !== "log") {
    closeLogDeleteFinalModal();
    return;
  }
  try {
    await deleteDoc(doc(refs.logs, state.deleteTarget.id));
    closeLogDeleteFinalModal();
    closeDeleteModal();
    showToast("ჩანაწერი წაიშალა");
  } catch (e) {
    closeLogDeleteFinalModal();
    closeDeleteModal();
    showToast(e.message || "წაშლა ვერ მოხერხდა", "error");
  }
}

async function deleteTargetEntity() {
  if (!requireAdmin("წაშლა")) return;
  if (!state.deleteTarget) return;

  try {
    if (state.deleteTarget.type === "product") {
      const usedInLogs = state.data.logs.some((l) => l.productId === state.deleteTarget.id);
      if (usedInLogs) {
        showToast("პროდუქტი ლოგში გამოიყენება და წაშლა შეუძლებელია", "error");
        closeDeleteModal();
        return;
      }
      await deleteDoc(doc(refs.products, state.deleteTarget.id));
    } else if (state.deleteTarget.type === "employee") {
      const usedInLogs = state.data.logs.some((l) => l.employeeId === state.deleteTarget.id);
      if (usedInLogs) {
        showToast("თანამშრომელი ლოგში გამოიყენება და წაშლა შეუძლებელია", "error");
        closeDeleteModal();
        return;
      }

      const emp = getEmployeeById(state.deleteTarget.id);
      if (!emp) throw new Error("თანამშრომელი ვერ მოიძებნა");

      await runTransaction(db, async (tx) => {
        tx.delete(doc(refs.employees, emp.id));
        tx.delete(doc(refs.employeeCodes, normalizeCode(emp.code)));
      });
    } else if (state.deleteTarget.type === "log") {
      openLogDeleteFinalModal();
      return;
    } else {
      throw new Error("წაშლის ტიპი არასწორია");
    }

    closeDeleteModal();
    showToast("ჩანაწერი წაიშალა");
  } catch (e) {
    closeDeleteModal();
    showToast(e.message || "წაშლა ვერ მოხერხდა", "error");
  }
}

function openEditModal(target) {
  state.editTarget = target;
  const title = document.getElementById("edit-modal-title");
  const fields = document.getElementById("edit-modal-fields");

  if (target.type === "product") {
    title.textContent = "პროდუქტის რედაქტირება";
    fields.innerHTML = `<input id="edit-product-name" type="text" class="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500" />`;
  } else {
    if (target.type === "log") {
      title.textContent = "ლოგის რედაქტირება";
      fields.innerHTML = `
        <select id="edit-log-type" class="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500">
          <option value="შეტანა">შეტანა</option>
          <option value="გატანა">გატანა</option>
        </select>
        <select id="edit-log-storage" class="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500">
          <option value="ბოქსი">ბოქსი</option>
          <option value="ორ სივრციანი">ორ სივრციანი</option>
        </select>
        <select id="edit-log-product" class="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"></select>
        <select id="edit-log-employee" class="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"></select>
        <input id="edit-log-qty" type="number" step="0.01" min="0.01" class="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500" />
        <textarea id="edit-log-comment" rows="2" class="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500" placeholder="კომენტარი (სურვილისამებრ)"></textarea>
      `;
    } else {
    title.textContent = "თანამშრომლის რედაქტირება";
    fields.innerHTML = `
      <input id="edit-emp-first" type="text" class="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500" />
      <input id="edit-emp-last" type="text" class="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500" />
      <input id="edit-emp-code" type="text" class="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500" />
    `;
    }
  }
  if (target.type === "product") {
    document.getElementById("edit-product-name").value = target.name;
  } else if (target.type === "log") {
    const productSelect = document.getElementById("edit-log-product");
    const employeeSelect = document.getElementById("edit-log-employee");
    productSelect.innerHTML = state.data.products
      .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
      .join("");
    employeeSelect.innerHTML = state.data.employees
      .map((e) => `<option value="${e.id}">${escapeHtml(fullName(e))}</option>`)
      .join("");
    document.getElementById("edit-log-type").value = target.operationType;
    document.getElementById("edit-log-storage").value = target.storage;
    document.getElementById("edit-log-product").value = target.productId;
    document.getElementById("edit-log-employee").value = target.employeeId;
    document.getElementById("edit-log-qty").value = normalizeKg(target.quantityKg);
    document.getElementById("edit-log-comment").value = target.comment || "";
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

async function saveEditModal() {
  if (!requireAdmin("რედაქტირება")) return;
  if (!state.editTarget) return;

  try {
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

      await updateDoc(doc(refs.products, state.editTarget.id), {
        name,
        nameLower: name.toLowerCase(),
        updatedAt: nowIso()
      });
    } else if (state.editTarget.type === "employee") {
      const firstName = document.getElementById("edit-emp-first").value.trim();
      const lastName = document.getElementById("edit-emp-last").value.trim();
      const code = document.getElementById("edit-emp-code").value.trim();

      if (!firstName || !lastName || !code) {
        showToast("შეავსეთ ყველა ველი", "error");
        return;
      }

      const codeLower = normalizeCode(code);
      const empId = state.editTarget.id;
      const currentEmp = getEmployeeById(empId);
      if (!currentEmp) throw new Error("თანამშრომელი ვერ მოიძებნა");

      await runTransaction(db, async (tx) => {
        const oldCodeLower = normalizeCode(currentEmp.code);
        const newCodeRef = doc(refs.employeeCodes, codeLower);
        const newCodeSnap = await tx.get(newCodeRef);

        if (newCodeSnap.exists() && newCodeSnap.data().employeeId !== empId) {
          throw new Error("ეს კოდი უკვე გამოყენებულია");
        }

        tx.update(doc(refs.employees, empId), {
          firstName,
          lastName,
          code,
          codeLower
        });

        if (oldCodeLower !== codeLower) {
          tx.delete(doc(refs.employeeCodes, oldCodeLower));
        }

        tx.set(newCodeRef, {
          employeeId: empId,
          code,
          createdAt: currentEmp.createdAt || nowIso()
        });
      });
    } else {
      const operationType = document.getElementById("edit-log-type").value;
      const storage = document.getElementById("edit-log-storage").value;
      const productId = document.getElementById("edit-log-product").value;
      const employeeId = document.getElementById("edit-log-employee").value;
      const quantityKg = normalizeKg(document.getElementById("edit-log-qty").value);
      const comment = document.getElementById("edit-log-comment").value.trim();

      if (!["შეტანა", "გატანა"].includes(operationType) || !["ბოქსი", "ორ სივრციანი"].includes(storage) || !productId || !employeeId || quantityKg <= 0) {
        showToast("ლოგის მონაცემები არასწორია", "error");
        return;
      }

      const logRef = doc(refs.logs, state.editTarget.id);
      await runTransaction(db, async (tx) => {
        const logSnap = await tx.get(logRef);
        if (!logSnap.exists()) throw new Error("ლოგი ვერ მოიძებნა");

        const oldLog = logSnap.data();
        const oldProductRef = doc(refs.products, oldLog.productId);
        const newProductRef = doc(refs.products, productId);
        const employeeRef = doc(refs.employees, employeeId);

        const [oldProdSnap, newProdSnap, empSnap] = await Promise.all([
          tx.get(oldProductRef),
          tx.get(newProductRef),
          tx.get(employeeRef)
        ]);

        if (!oldProdSnap.exists() || !newProdSnap.exists()) throw new Error("პროდუქტი ვერ მოიძებნა");
        if (!empSnap.exists()) throw new Error("თანამშრომელი ვერ მოიძებნა");

        const oldKey = storageToKey(oldLog.storage);
        const newKey = storageToKey(storage);
        const oldQty = normalizeKg(oldLog.quantityKg || 0);

        const stockMap = new Map();
        const oldProductId = oldLog.productId;
        const newProductId = productId;

        const oldCurrent = normalizeKg(oldProdSnap.data()[oldKey] || 0);
        const reversedOld = oldLog.operationType === "შეტანა" ? oldCurrent - oldQty : oldCurrent + oldQty;
        if (reversedOld < 0) throw new Error("რედაქტირება ვერ ხერხდება, რადგან მარაგი უარყოფითში გადავა");
        stockMap.set(`${oldProductId}:${oldKey}`, reversedOld);

        const readNewBase = () => {
          const key = `${newProductId}:${newKey}`;
          if (stockMap.has(key)) return stockMap.get(key);
          return normalizeKg(newProdSnap.data()[newKey] || 0);
        };

        const newBase = readNewBase();
        const appliedNew = operationType === "შეტანა" ? newBase + quantityKg : newBase - quantityKg;
        if (appliedNew < 0) throw new Error("არასაკმარისი მარაგი არჩეული ცვლილებისთვის");
        stockMap.set(`${newProductId}:${newKey}`, appliedNew);

        for (const [k, value] of stockMap.entries()) {
          const [pId, sKey] = k.split(":");
          tx.update(doc(refs.products, pId), {
            [sKey]: normalizeKg(value),
            updatedAt: nowIso()
          });
        }

        tx.update(logRef, {
          operationType,
          storage,
          productId,
          productName: newProdSnap.data().name,
          employeeId,
          employeeName: `${empSnap.data().firstName} ${empSnap.data().lastName}`,
          quantityKg,
          comment,
          updatedAt: nowIso()
        });
      });
    }

    closeEditModal();
    showToast("ცვლილება შენახულია");
  } catch (e) {
    showToast(e.message || "ცვლილების შენახვა ვერ მოხერხდა", "error");
  }
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
    if (state.role === "admin") {
      deactivateAdminSession();
      return;
    }
    if (state.adminAuthenticated || hasAdminSession()) {
      activateAdminSession();
      return;
    }
    openAdminLoginModal();
  });

  document.getElementById("admin-login-cancel").addEventListener("click", closeAdminLoginModal);
  document.getElementById("admin-login-confirm").addEventListener("click", tryAdminLogin);
  document.getElementById("admin-password-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryAdminLogin();
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
  document.getElementById("code-input").addEventListener("input", (e) => {
    e.target.value = String(e.target.value || "").replace(/\D+/g, "");
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

  document.getElementById("log-list").addEventListener("click", (e) => {
    const id = e.target.dataset.id;
    if (!id) return;

    if (e.target.classList.contains("edit-log")) {
      if (!requireAdmin("ლოგის რედაქტირება")) return;
      const log = state.data.logs.find((l) => l.id === id);
      if (log) openEditModal({ type: "log", ...log });
    }
    if (e.target.classList.contains("delete-log")) {
      if (!requireAdmin("ლოგის წაშლა")) return;
      const log = state.data.logs.find((l) => l.id === id);
      if (log) openDeleteModal({ type: "log", id: log.id });
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
  document.getElementById("log-delete-final-cancel").addEventListener("click", closeLogDeleteFinalModal);
  document.getElementById("log-delete-final-confirm").addEventListener("click", confirmLogDeleteFinal);

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

  bindOperationButtons();
}

async function init() {
  bindEvents();
  if (hasAdminSession()) {
    state.adminAuthenticated = true;
    setRole("admin");
    setView("admin");
  } else {
    setRole("user");
    setView("stock");
  }

  startRealtimeListeners();

  try {
    await ensureBootstrapData();
    showToast("Firebase კავშირი აქტიურია", "info");
  } catch (e) {
    console.error(e);
    showToast("მონაცემების ინიციალიზაცია ნაწილობრივ შეიზღუდა (Rules/Auth)", "error");
  }
}

init();
