import express from "express";
import cors from "cors";
import Database from "better-sqlite3";

const PORT = process.env.PORT || 4000;
const DB_FILE = process.env.DB_FILE || "./inventory.db";

const app = express();
app.use(cors());
app.use(express.json());

const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  box_stock REAL NOT NULL DEFAULT 0,
  two_space_stock REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  operation_id TEXT UNIQUE NOT NULL,
  timestamp TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  storage TEXT NOT NULL,
  quantity_kg REAL NOT NULL,
  comment TEXT,
  FOREIGN KEY(employee_id) REFERENCES employees(id),
  FOREIGN KEY(product_id) REFERENCES products(id)
);
`);

const nowIso = () => new Date().toISOString();
const normalizeKg = (n) => Number(Number(n).toFixed(3));
const genId = (prefix) => `${prefix}_${crypto.randomUUID()}`;

const defaultProducts = ["სულგუნი", "იმერული", "შებოლილი სულგუნი", "სკამორცა", "ტომი"];
const initialProductCount = db.prepare("SELECT COUNT(*) AS count FROM products").get().count;
if (!initialProductCount) {
  const ins = db.prepare(`INSERT INTO products(id,name,box_stock,two_space_stock,created_at,updated_at) VALUES(?,?,?,?,?,?)`);
  const ts = nowIso();
  const tx = db.transaction(() => {
    for (const name of defaultProducts) {
      ins.run(genId("prd"), name, 0, 0, ts, ts);
    }
  });
  tx();
}

const initialEmployeeCount = db.prepare("SELECT COUNT(*) AS count FROM employees").get().count;
if (!initialEmployeeCount) {
  db.prepare(`INSERT INTO employees(id,first_name,last_name,code,created_at) VALUES(?,?,?,?,?)`).run(
    genId("emp"),
    "ნიკა",
    "ღაღაშვილი",
    "1",
    nowIso()
  );
}

app.get("/api/health", (_, res) => res.json({ ok: true }));

app.get("/api/bootstrap", (_, res) => {
  const products = db.prepare(`SELECT * FROM products ORDER BY name`).all();
  const employees = db.prepare(`SELECT * FROM employees ORDER BY first_name, last_name`).all();
  const logs = db.prepare(`SELECT * FROM logs ORDER BY timestamp DESC`).all();
  res.json({ products, employees, logs });
});

app.post("/api/products", (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ ok: false, error: "პროდუქტის სახელი აუცილებელია" });

  const id = genId("prd");
  const ts = nowIso();
  try {
    db.prepare(`INSERT INTO products(id,name,box_stock,two_space_stock,created_at,updated_at) VALUES(?,?,?,?,?,?)`).run(
      id,
      name,
      0,
      0,
      ts,
      ts
    );
    res.json({ ok: true, id });
  } catch {
    res.status(409).json({ ok: false, error: "პროდუქტი უკვე არსებობს" });
  }
});

app.put("/api/products/:id", (req, res) => {
  const id = req.params.id;
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ ok: false, error: "პროდუქტის სახელი აუცილებელია" });

  try {
    const result = db.prepare(`UPDATE products SET name=?, updated_at=? WHERE id=?`).run(name, nowIso(), id);
    if (!result.changes) return res.status(404).json({ ok: false, error: "პროდუქტი ვერ მოიძებნა" });

    db.prepare(`UPDATE logs SET product_name=? WHERE product_id=?`).run(name, id);
    res.json({ ok: true });
  } catch {
    res.status(409).json({ ok: false, error: "პროდუქტი უკვე არსებობს" });
  }
});

app.delete("/api/products/:id", (req, res) => {
  const id = req.params.id;
  const used = db.prepare(`SELECT 1 FROM logs WHERE product_id=? LIMIT 1`).get(id);
  if (used) return res.status(409).json({ ok: false, error: "პროდუქტი ლოგში გამოიყენება" });

  const result = db.prepare(`DELETE FROM products WHERE id=?`).run(id);
  if (!result.changes) return res.status(404).json({ ok: false, error: "პროდუქტი ვერ მოიძებნა" });
  res.json({ ok: true });
});

app.post("/api/employees", (req, res) => {
  const firstName = String(req.body?.firstName || "").trim();
  const lastName = String(req.body?.lastName || "").trim();
  const code = String(req.body?.code || "").trim();
  if (!firstName || !lastName || !code) {
    return res.status(400).json({ ok: false, error: "სახელი, გვარი და კოდი აუცილებელია" });
  }

  try {
    db.prepare(`INSERT INTO employees(id,first_name,last_name,code,created_at) VALUES(?,?,?,?,?)`).run(
      genId("emp"),
      firstName,
      lastName,
      code,
      nowIso()
    );
    res.json({ ok: true });
  } catch {
    res.status(409).json({ ok: false, error: "ეს კოდი უკვე არსებობს" });
  }
});

app.put("/api/employees/:id", (req, res) => {
  const id = req.params.id;
  const firstName = String(req.body?.firstName || "").trim();
  const lastName = String(req.body?.lastName || "").trim();
  const code = String(req.body?.code || "").trim();
  if (!firstName || !lastName || !code) {
    return res.status(400).json({ ok: false, error: "სახელი, გვარი და კოდი აუცილებელია" });
  }

  try {
    const result = db.prepare(`UPDATE employees SET first_name=?, last_name=?, code=? WHERE id=?`).run(firstName, lastName, code, id);
    if (!result.changes) return res.status(404).json({ ok: false, error: "თანამშრომელი ვერ მოიძებნა" });
    db.prepare(`UPDATE logs SET employee_name=? WHERE employee_id=?`).run(`${firstName} ${lastName}`, id);
    res.json({ ok: true });
  } catch {
    res.status(409).json({ ok: false, error: "ეს კოდი უკვე გამოიყენება" });
  }
});

app.delete("/api/employees/:id", (req, res) => {
  const id = req.params.id;
  const used = db.prepare(`SELECT 1 FROM logs WHERE employee_id=? LIMIT 1`).get(id);
  if (used) return res.status(409).json({ ok: false, error: "თანამშრომელი ლოგში გამოიყენება" });

  const result = db.prepare(`DELETE FROM employees WHERE id=?`).run(id);
  if (!result.changes) return res.status(404).json({ ok: false, error: "თანამშრომელი ვერ მოიძებნა" });
  res.json({ ok: true });
});

app.post("/api/operations", (req, res) => {
  const operationId = String(req.body?.operationId || "").trim() || genId("op");
  const operationType = String(req.body?.operationType || "").trim();
  const storage = String(req.body?.storage || "").trim();
  const productId = String(req.body?.productId || "").trim();
  const quantityKg = normalizeKg(req.body?.quantityKg || 0);
  const employeeCode = String(req.body?.employeeCode || "").trim();
  const comment = String(req.body?.comment || "").trim();

  if (!["შეტანა", "გატანა"].includes(operationType)) {
    return res.status(400).json({ ok: false, error: "არასწორი ოპერაციის ტიპი" });
  }
  if (!["ბოქსი", "ორ სივრციანი"].includes(storage)) {
    return res.status(400).json({ ok: false, error: "არასწორი საცავი" });
  }
  if (!productId || !employeeCode || !quantityKg || quantityKg <= 0) {
    return res.status(400).json({ ok: false, error: "შეავსეთ აუცილებელი ველები" });
  }

  const tx = db.transaction(() => {
    const existing = db.prepare(`SELECT 1 FROM logs WHERE operation_id=?`).get(operationId);
    if (existing) return { ok: false, status: 409, error: "ოპერაცია უკვე დამუშავებულია" };

    const employee = db.prepare(`SELECT * FROM employees WHERE lower(code)=lower(?)`).get(employeeCode);
    if (!employee) return { ok: false, status: 401, error: "არასწორი თანამშრომლის კოდი" };

    const product = db.prepare(`SELECT * FROM products WHERE id=?`).get(productId);
    if (!product) return { ok: false, status: 404, error: "პროდუქტი ვერ მოიძებნა" };

    const key = storage === "ბოქსი" ? "box_stock" : "two_space_stock";
    const current = normalizeKg(product[key]);
    if (operationType === "გატანა" && quantityKg > current) {
      return { ok: false, status: 409, error: `არასაკმარისი მარაგი. ხელმისაწვდომია ${current.toFixed(2)} კგ` };
    }

    const nextAmount = operationType === "შეტანა" ? current + quantityKg : current - quantityKg;
    db.prepare(`UPDATE products SET ${key}=?, updated_at=? WHERE id=?`).run(normalizeKg(nextAmount), nowIso(), productId);

    db.prepare(`
      INSERT INTO logs(id, operation_id, timestamp, employee_id, employee_name, operation_type, product_id, product_name, storage, quantity_kg, comment)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      genId("log"),
      operationId,
      nowIso(),
      employee.id,
      `${employee.first_name} ${employee.last_name}`,
      operationType,
      product.id,
      product.name,
      storage,
      quantityKg,
      comment
    );

    return { ok: true };
  });

  const result = tx();
  if (!result.ok) {
    return res.status(result.status || 400).json({ ok: false, error: result.error });
  }
  res.json({ ok: true });
});

app.get("/api/logs", (req, res) => {
  let query = `SELECT * FROM logs WHERE 1=1`;
  const params = [];

  if (req.query.productId) {
    query += ` AND product_id = ?`;
    params.push(String(req.query.productId));
  }
  if (req.query.employeeId) {
    query += ` AND employee_id = ?`;
    params.push(String(req.query.employeeId));
  }
  if (req.query.operationType) {
    query += ` AND operation_type = ?`;
    params.push(String(req.query.operationType));
  }
  if (req.query.storage) {
    query += ` AND storage = ?`;
    params.push(String(req.query.storage));
  }
  if (req.query.dateFrom) {
    query += ` AND substr(timestamp,1,10) >= ?`;
    params.push(String(req.query.dateFrom));
  }
  if (req.query.dateTo) {
    query += ` AND substr(timestamp,1,10) <= ?`;
    params.push(String(req.query.dateTo));
  }

  query += ` ORDER BY timestamp DESC`;
  const rows = db.prepare(query).all(...params);
  res.json({ ok: true, logs: rows });
});

app.listen(PORT, () => {
  console.log(`Backend გაშვებულია პორტზე: ${PORT}`);
});
