const CATEGORY_COLORS = {
  Food: "#78a77d",
  Housing: "#758cb4",
  Transport: "#d19969",
  Shopping: "#b183ac",
  Bills: "#d0ad5b",
  Health: "#5da8a0",
  Entertainment: "#d27d70",
  Other: "#97a19a",
};
const CATEGORY_ICONS = {
  Food: "✳",
  Housing: "⌂",
  Transport: "↗",
  Shopping: "◇",
  Bills: "≋",
  Health: "+",
  Entertainment: "♫",
  Other: "·",
};
const PERIOD_LABELS = {
  week: "This week",
  month: "This month",
  year: "This year",
  all: "All time",
};

const elements = {
  today: document.querySelector("#today-label"),
  period: document.querySelector("#period-select"),
  total: document.querySelector("#total-spent"),
  count: document.querySelector("#transaction-count"),
  average: document.querySelector("#daily-average"),
  topCategory: document.querySelector("#top-category"),
  totalContext: document.querySelector("#total-context"),
  countContext: document.querySelector("#count-context"),
  averageContext: document.querySelector("#average-context"),
  categoryContext: document.querySelector("#category-context"),
  trendPeriod: document.querySelector("#trend-period"),
  chartTotal: document.querySelector("#chart-total"),
  chartCaption: document.querySelector("#chart-caption"),
  trendChart: document.querySelector("#trend-chart"),
  trendEmpty: document.querySelector("#trend-empty"),
  categoryTotal: document.querySelector("#category-total"),
  categoryList: document.querySelector("#category-list"),
  categoryEmpty: document.querySelector("#category-empty"),
  transactions: document.querySelector("#transaction-list"),
  transactionEmpty: document.querySelector("#transaction-empty"),
  resultsCount: document.querySelector("#results-count"),
  form: document.querySelector("#expense-form"),
  description: document.querySelector("#description"),
  amount: document.querySelector("#amount"),
  category: document.querySelector("#category"),
  date: document.querySelector("#date"),
  message: document.querySelector("#form-message"),
  submit: document.querySelector(".submit-button"),
};

let expenses = [];

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMoney(amount) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(dateString, options = { month: "short", day: "numeric" }) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, options).format(new Date(year, month - 1, day));
}

function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getPeriodBounds(period, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  if (period === "week") {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    end.setDate(start.getDate() + 6);
  } else if (period === "month") {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1, 0);
  } else if (period === "year") {
    start.setMonth(0, 1);
    end.setMonth(11, 31);
  } else {
    return null;
  }
  return { start, end };
}

function matchesPeriod(expense, period, now = new Date()) {
  if (period === "all") return true;
  const bounds = getPeriodBounds(period, now);
  const expenseDate = parseLocalDate(expense.date);
  return expenseDate >= bounds.start && expenseDate <= bounds.end;
}

function summarize(items) {
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const categoryTotals = new Map();
  for (const item of items) {
    categoryTotals.set(item.category, (categoryTotals.get(item.category) || 0) + item.amount);
  }
  const categories = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]);
  return { total, categories };
}

function getDailyAverage(total, period, items, now = new Date()) {
  if (total === 0) return 0;
  if (period === "all") {
    const dates = items.map((item) => item.date).sort();
    const firstDay = parseLocalDate(dates[0]);
    const lastDay = parseLocalDate(dates[dates.length - 1]);
    const elapsedDays = Math.floor((lastDay - firstDay) / 86400000) + 1;
    return total / elapsedDays;
  }
  const bounds = getPeriodBounds(period, now);
  const lastElapsedDay = now < bounds.end ? now : bounds.end;
  const elapsedDays = Math.max(1, Math.floor((lastElapsedDay - bounds.start) / 86400000) + 1);
  return total / elapsedDays;
}

function getChartBuckets(period, items, now = new Date()) {
  if (period === "week") {
    const bounds = getPeriodBounds(period, now);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(bounds.start);
      date.setDate(date.getDate() + index);
      const key = localDateString(date);
      return { key, label: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date) };
    });
  }

  if (period === "month") {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      return {
        key: localDateString(new Date(now.getFullYear(), now.getMonth(), day)),
        label: day % 5 === 1 || day === daysInMonth ? String(day) : "",
      };
    });
  }

  if (period === "year") {
    return Array.from({ length: 12 }, (_, index) => ({
      key: `${now.getFullYear()}-${String(index + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(now.getFullYear(), index, 1)),
    }));
  }

  if (items.length === 0) return [];
  const dates = items.map((item) => item.date).sort();
  const firstDate = parseLocalDate(dates[0]);
  const lastDate = parseLocalDate(dates[dates.length - 1]);
  const firstMonth = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
  const lastMonth = new Date(lastDate.getFullYear(), lastDate.getMonth(), 1);
  const monthCount =
    (lastMonth.getFullYear() - firstMonth.getFullYear()) * 12 +
    lastMonth.getMonth() - firstMonth.getMonth() + 1;
  const bucketCount = Math.min(monthCount, 12);
  const startMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth() - bucketCount + 1, 1);
  return Array.from({ length: bucketCount }, (_, index) => {
    const date = new Date(startMonth.getFullYear(), startMonth.getMonth() + index, 1);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return {
      key: `${date.getFullYear()}-${month}`,
      label: new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit" }).format(date),
    };
  });
}

function renderStats(items, period, totals) {
  const label = PERIOD_LABELS[period];
  elements.total.textContent = formatMoney(totals.total);
  elements.count.textContent = String(items.length);
  elements.average.textContent = formatMoney(getDailyAverage(totals.total, period, items));
  elements.totalContext.textContent = label;
  elements.countContext.textContent = label;
  elements.averageContext.textContent = label;
  elements.categoryContext.textContent = totals.categories.length
    ? `${formatMoney(totals.categories[0][1])} spent`
    : "No spending yet";
  elements.topCategory.textContent = totals.categories.length ? totals.categories[0][0] : "—";
}

function renderChart(items, period, total) {
  elements.trendPeriod.textContent = PERIOD_LABELS[period];
  elements.chartTotal.textContent = formatMoney(total);
  elements.chartCaption.textContent = `Total for ${PERIOD_LABELS[period].toLowerCase()}`;
  elements.trendChart.replaceChildren();

  const buckets = getChartBuckets(period, items);
  const amounts = new Map(buckets.map((bucket) => [bucket.key, 0]));
  for (const item of items) {
    const key = period === "year" || period === "all" ? item.date.slice(0, 7) : item.date;
    if (amounts.has(key)) amounts.set(key, amounts.get(key) + item.amount);
  }

  const maximum = Math.max(...amounts.values(), 0);
  elements.trendEmpty.hidden = total > 0;
  elements.trendChart.hidden = total === 0;
  if (total === 0) return;

  const today = localDateString();
  for (const bucket of buckets) {
    const amount = amounts.get(bucket.key);
    const column = document.createElement("div");
    column.className = "chart-bar";
    column.title = `${bucket.label || bucket.key}: ${formatMoney(amount)}`;
    const track = document.createElement("div");
    track.className = "bar-track";
    const bar = document.createElement("div");
    bar.className = "bar-fill";
    if (bucket.key === today || bucket.key === today.slice(0, 7)) bar.classList.add("today");
    bar.style.height = `${amount ? Math.max((amount / maximum) * 100, 5) : 2}%`;
    bar.setAttribute("aria-hidden", "true");
    track.append(bar);
    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = bucket.label;
    column.append(track, label);
    elements.trendChart.append(column);
  }
}

function renderCategories(categories, total) {
  elements.categoryList.replaceChildren();
  elements.categoryTotal.textContent = `${categories.length} ${categories.length === 1 ? "category" : "categories"}`;
  elements.categoryEmpty.hidden = categories.length !== 0;
  elements.categoryList.hidden = categories.length === 0;

  for (const [name, amount] of categories.slice(0, 5)) {
    const row = document.createElement("div");
    row.className = "category-row";
    const top = document.createElement("div");
    top.className = "category-row-top";
    const label = document.createElement("span");
    label.className = "category-name";
    const dot = document.createElement("span");
    dot.className = "category-dot";
    dot.style.backgroundColor = CATEGORY_COLORS[name] || CATEGORY_COLORS.Other;
    const nameText = document.createElement("span");
    nameText.textContent = name;
    label.append(dot, nameText);
    const value = document.createElement("span");
    value.className = "category-value";
    value.textContent = `${formatMoney(amount)} · ${Math.round((amount / total) * 100)}%`;
    top.append(label, value);
    const progress = document.createElement("div");
    progress.className = "category-progress";
    progress.setAttribute("role", "meter");
    progress.setAttribute("aria-label", `${name}: ${Math.round((amount / total) * 100)} percent of spending`);
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "100");
    progress.setAttribute("aria-valuenow", String(Math.round((amount / total) * 100)));
    const fill = document.createElement("span");
    fill.style.width = `${(amount / total) * 100}%`;
    fill.style.backgroundColor = CATEGORY_COLORS[name] || CATEGORY_COLORS.Other;
    progress.append(fill);
    row.append(top, progress);
    elements.categoryList.append(row);
  }
}

function renderTransactions(items) {
  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  elements.transactions.replaceChildren();
  elements.resultsCount.textContent = `${items.length} ${items.length === 1 ? "transaction" : "transactions"}`;
  elements.transactionEmpty.hidden = sorted.length !== 0;

  for (const expense of sorted.slice(0, 8)) {
    const row = document.createElement("tr");
    const descriptionCell = document.createElement("td");
    const description = document.createElement("span");
    description.className = "transaction-description";
    const icon = document.createElement("span");
    icon.className = "transaction-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = CATEGORY_ICONS[expense.category] || CATEGORY_ICONS.Other;
    const descriptionText = document.createElement("span");
    descriptionText.textContent = expense.description;
    description.append(icon, descriptionText);
    descriptionCell.append(description);

    const categoryCell = document.createElement("td");
    const category = document.createElement("span");
    category.className = "category-pill";
    category.textContent = expense.category;
    categoryCell.append(category);

    const dateCell = document.createElement("td");
    dateCell.textContent = formatDate(expense.date);
    const amountCell = document.createElement("td");
    amountCell.className = "transaction-amount";
    amountCell.textContent = `−${formatMoney(expense.amount)}`;
    const actionCell = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "×";
    deleteButton.setAttribute("aria-label", `Delete ${expense.description}`);
    deleteButton.addEventListener("click", () => deleteExpense(expense));
    actionCell.append(deleteButton);
    row.append(descriptionCell, categoryCell, dateCell, amountCell, actionCell);
    elements.transactions.append(row);
  }
}

function render() {
  const period = elements.period.value;
  const visibleExpenses = expenses.filter((expense) => matchesPeriod(expense, period));
  const totals = summarize(visibleExpenses);
  renderStats(visibleExpenses, period, totals);
  renderChart(visibleExpenses, period, totals.total);
  renderCategories(totals.categories, totals.total);
  renderTransactions(visibleExpenses);
}

async function request(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || `Request failed with status ${response.status}.`);
  }
  return response.status === 204 ? null : response.json();
}

async function loadExpenses() {
  try {
    expenses = await request("/api/expenses");
    render();
  } catch (error) {
    elements.message.textContent = `Could not load your expenses: ${error.message}`;
    elements.message.hidden = false;
  }
}

async function addExpense(event) {
  event.preventDefault();
  elements.message.hidden = true;
  elements.submit.disabled = true;
  const expense = {
    description: elements.description.value.trim(),
    amount: Number(elements.amount.value),
    category: elements.category.value,
    date: elements.date.value,
  };

  try {
    const created = await request("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(expense),
    });
    expenses = [created, ...expenses];
    elements.form.reset();
    elements.date.value = localDateString();
    render();
    elements.description.focus();
  } catch (error) {
    elements.message.textContent = error.message;
    elements.message.hidden = false;
  } finally {
    elements.submit.disabled = false;
  }
}

async function deleteExpense(expense) {
  try {
    await request(`/api/expenses/${encodeURIComponent(expense.id)}`, { method: "DELETE" });
    expenses = expenses.filter((item) => item.id !== expense.id);
    render();
  } catch (error) {
    elements.message.textContent = `Could not delete this expense: ${error.message}`;
    elements.message.hidden = false;
  }
}

elements.today.textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
}).format(new Date());
elements.date.value = localDateString();
elements.period.addEventListener("change", render);
elements.form.addEventListener("submit", addExpense);
loadExpenses();
