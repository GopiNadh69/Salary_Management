# ExpenseEase - Smart Expense Tracker

A web application implementation of the study **"Expense Tracker using Naive Bayes Algorithm for Automated Expense Tracking"** (IJRES-V10I3P108).

Built entirely with **HTML, CSS and vanilla JavaScript** in an elegant **orange and cream** theme.

## Features

- **Dashboard** — total income, expenses, net balance and transaction count
- **Pie Charts** (Chart.js) for **weekly, monthly and yearly** time frames
- **Category breakdown** — top 5 spending categories with animated progress bars
- **Transactions** — add, edit, search, filter and delete expenses/income
- **Budgets** — set monthly limits per category with live progress bars and over-limit alerts
- **Bank SMS Auto-Detect** — paste any bank message and the built-in **Naive Bayes classifier** predicts the category, type (income/expense), amount, merchant and date — then add it in one click
- **Smart categories** — income entries are restricted to Salary/Other automatically
- **Data persistence** — localStorage out of the box; optional **Firebase Realtime Database** cross-device sync
- **Reset Data** button to restore the demo dataset
- Fully responsive layout with a mobile sidebar menu

## Getting Started

**Option A — just open it:**
Open `index.html` in a browser. (ES modules require a server, so Option B is recommended.)

**Option B — local server (recommended):**

```bash
cd expense-tracker
python -m http.server 8080
# then visit http://localhost:8080
```

On first launch, sample data is loaded automatically so you can explore immediately.

## How the Naive Bayes Classifier Works

The `js/naiveBayes.js` module implements a keyword-based **Multinomial Naive Bayes** classifier:

1. The bank SMS is **tokenized** (lowercased, non-alphanumerics removed).
2. Each category (food, transport, shopping, utilities, ...) has a training vocabulary of merchant/UPI handle keywords.
3. A score is computed per category with **Laplace smoothing**.
4. **Type prediction** (income vs expense) uses keywords like `credited`, `salary` vs `debited`, `paid`.
5. Amounts (`rs 349`, `$12.99`, `INR 1,200`), dates (`05-09-2026`) and merchants (`Zomato`, `Ola`, `Netflix`) are extracted via regex.

### Try it
Paste a message like:

```
A/c XX1234 debited Rs 349.00 on 04-09-2026 at ZOMATO order #8910. UPI: zomato@paytm
```

It will be classified as **Expense → Food & Dining** and can be added with one click. Click a **sample chip** (Salary / Food / Transport) to try the classifier instantly.

## Firebase Setup (optional)

To sync data across devices, create a Firebase Realtime Database and add your config in `index.html`:

```html
<script>
  window.EXPENSEEASE_FIREBASE = {
    apiKey: "YOUR_API_KEY",
    projectId: "YOUR_PROJECT_ID",
    databaseURL: "https://YOUR_PROJECT.firebaseio.com",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
  };
</script>
```

Without a config, the app persists everything in `localStorage`.

## Testing

The app ships with an automated end-to-end suite (driven by Playwright against local Chrome) that verifies all 23 core interactions — dashboard stats, timeframe switching, search, filters, add/edit/delete, budgets, and SMS classification.

## Project Structure

```
expense-tracker/
├── index.html          # App markup
├── README.md
├── css/
│   └── style.css       # Orange & cream theme
└── js/
    ├── main.js         # UI logic, rendering, charts, interactions
    ├── storage.js      # Data layer (localStorage + Firebase)
    └── naiveBayes.js   # Naive Bayes classifier
```

## Credits

Based on the research paper *"Expense Tracker using Naive Bayes Algorithm for Automated Expense Tracking"* (IJRES-V10I3P108). Chart.js is used for visualizations.