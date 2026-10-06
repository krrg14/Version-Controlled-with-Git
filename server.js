const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "expenses.json");
const MAX_REQUEST_BYTES = 10 * 1024;
const CATEGORIES = [
  "Food",
  "Housing",
  "Transport",
  "Shopping",
  "Bills",
  "Health",
  "Entertainment",
  "Other",
];
const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

let expenses = [];
let writeQueue = Promise.resolve();

async function loadExpenses() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const contents = await fs.readFile(DATA_FILE, "utf8");
    const savedExpenses = JSON.parse(contents);
    if (!Array.isArray(savedExpenses)) {
      throw new Error("The expense data file must contain a JSON array.");
    }
    expenses = savedExpenses;
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.writeFile(DATA_FILE, "[]\n", "utf8");
      expenses = [];
      return;
    }
    throw error;
  }
}

function persistExpenses() {
  const snapshot = `${JSON.stringify(expenses, null, 2)}\n`;
  const write = writeQueue.then(async () => {
    const temporaryFile = `${DATA_FILE}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryFile, snapshot, "utf8");
      await fs.rename(temporaryFile, DATA_FILE);
    } catch (error) {
      await fs.rm(temporaryFile, { force: true }).catch(() => {});
      throw error;
    }
  });
  writeQueue = write.catch(() => {});
  return write;
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;
    request.on("data", (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) {
        tooLarge = true;
        body = "";
      }
    });
    request.on("end", () => {
      if (tooLarge) {
        reject(Object.assign(new Error("Request body is too large."), { statusCode: 413 }));
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("Request body must be valid JSON."), { statusCode: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function validateExpense(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return "Provide an expense object.";
  }
  if (
    typeof input.description !== "string" ||
    input.description.trim().length === 0 ||
    input.description.trim().length > 100
  ) {
    return "Description must be between 1 and 100 characters.";
  }
  if (
    typeof input.amount !== "number" ||
    !Number.isFinite(input.amount) ||
    input.amount <= 0 ||
    input.amount > 100000000
  ) {
    return "Amount must be greater than 0 and no more than 100,000,000.";
  }
  if (!CATEGORIES.includes(input.category)) {
    return "Choose a valid expense category.";
  }
  if (
    typeof input.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
    new Date(`${input.date}T00:00:00.000Z`).toISOString().slice(0, 10) !== input.date
  ) {
    return "Enter a valid expense date.";
  }
  return null;
}

async function serveStaticFile(pathname, response) {
  const files = {
    "/": "index.html",
    "/index.html": "index.html",
    "/styles.css": "styles.css",
    "/app.js": "app.js",
  };
  const fileName = files[pathname];
  if (!fileName) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  try {
    const filePath = path.join(PUBLIC_DIR, fileName);
    const contents = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[path.extname(filePath)],
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(contents);
  } catch (error) {
    console.error("Unable to serve static file:", error);
    sendJson(response, 500, { error: "Unable to load the application." });
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/api/expenses") {
    if (request.method === "GET") {
      sendJson(response, 200, expenses);
      return;
    }
    if (request.method === "POST") {
      const input = await readJsonBody(request);
      const validationError = validateExpense(input);
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }
      const expense = {
        id: randomUUID(),
        description: input.description.trim(),
        amount: Math.round(input.amount * 100) / 100,
        category: input.category,
        date: input.date,
        createdAt: new Date().toISOString(),
      };
      expenses = [expense, ...expenses];
      await persistExpenses();
      sendJson(response, 201, expense);
      return;
    }
    response.setHeader("Allow", "GET, POST");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  const expenseMatch = url.pathname.match(/^\/api\/expenses\/([^/]+)$/);
  if (expenseMatch) {
    if (request.method !== "DELETE") {
      response.setHeader("Allow", "DELETE");
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }
    let id;
    try {
      id = decodeURIComponent(expenseMatch[1]);
    } catch {
      sendJson(response, 400, { error: "Invalid expense ID." });
      return;
    }
    const existingCount = expenses.length;
    expenses = expenses.filter((expense) => expense.id !== id);
    if (expenses.length === existingCount) {
      sendJson(response, 404, { error: "Expense not found." });
      return;
    }
    await persistExpenses();
    response.writeHead(204);
    response.end();
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }
  await serveStaticFile(url.pathname, response);
}

async function start() {
  await loadExpenses();
  const server = http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      console.error("Request failed:", error);
      if (!response.headersSent) {
        sendJson(response, error.statusCode || 500, {
          error: error.statusCode ? error.message : "An unexpected server error occurred.",
        });
      } else {
        response.destroy();
      }
    });
  });
  server.listen(PORT, HOST, () => {
    console.log(`Expense tracker running at http://${HOST}:${PORT}`);
  });
}

start().catch((error) => {
  console.error("Unable to start the expense tracker:", error);
  process.exitCode = 1;
});
