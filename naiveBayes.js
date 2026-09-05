/**
 * ExpenseEase - Naive Bayes Classifier
 * Classifies bank SMS messages into categories (food, transport, shopping, ...)
 * and type (income vs expense) using Multinomial Naive Bayes.
 */
const NaiveBayes = (() => {
  const CATEGORIES = [
    'food',
    'transport',
    'shopping',
    'utilities',
    'entertainment',
    'health',
    'housing',
    'education',
    'travel',
    'salary',
    'other'
  ];

  // Hand-written training vocabulary. Each category maps keyword match-star counts.
  // In a real app these are learned from a labeled dataset; here a curated
  // keyword score table keeps the classifier working without stored data.
  const TRAINING = {
    food: ['food', 'restaurant', 'hotel', 'burger', 'pizza', 'swiggy', 'zomato', 'dominos', 'mcdonald', 'kfc', 'grocery', 'supermarket', 'walmart', 'target', 'bigbasket', 'blinkit', 'amazonfresh', 'coffee', 'cafe', 'starbucks', 'meat', 'veggie', 'dining', 'eat', 'mcd'],
    transport: ['uber', 'ola', 'rapido', 'ola', 'transport', 'taxi', 'cab', 'fuel', 'petrol', 'diesel', 'gas', 'parking', 'metro', 'train', 'bus', 'flight', 'emt', 'rail', 'road', 'rickshaw', 'fueled'],
    shopping: ['amazon', 'flipkart', 'myntra', 'shopping', 'swipe', 'pos', 'mall', 'store', 'purchase', 'buy', 'ebay', 'aliexpress', 'nike', 'adidas', 'zara', 'cloth', 'wardrobe', 'retail', 'market', 'shop'],
    utilities: ['electricity', 'water', 'kseb', 'utility', 'electric', 'bill', 'recharge', 'mobile', 'phone', 'internet', 'wifi', 'broadband', 'jio', 'airtel', 'vi', 'act', 'gas bill', 'cylinder'],
    entertainment: ['netflix', 'prime', 'hotstar', 'spotify', 'entertainment', 'movie', 'cinema', 'pvr', 'game', 'steam', 'psn', 'youtube', 'play store', 'appstore', 'subscription', 'playstation', 'xbox', 'bookmyshow'],
    health: ['hospital', 'clinic', 'doctor', 'pharmacy', 'medic', 'medical', 'health', 'apollo', 'chemist', 'dental', 'lab', 'diagnostics', 'physio'],
    housing: ['rent', 'housing', 'mortgage', 'flat', 'building', 'apartment', 'maintenance', 'association', 'property', 'lease'],
    education: ['school', 'college', 'tuition', 'education', 'fee', 'university', 'course', 'book', 'udemy', 'coursera', 'exam', 'library', 'hostel'],
    travel: ['travel', 'irctc', 'makemytrip', 'goibibo', 'hotel booking', 'holiday', 'vacation', 'airline', 'ryanair', 'emirates', 'agent', 'yatra', 'cleartrip', 'oyo'],
    salary: ['salary', 'credited', 'credit', 'deposit', 'payroll', 'wages', 'pf', 'employer', 'monthly credit']
  };

  const INCOME_KEYWORDS = ['credited', 'credit', 'salary', 'deposit', 'payroll', 'refund', 'cashback', 'received', 'incoming', 'wages', 'credited with'];

  function tokenize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1);
  }

  function computeScores(text, table) {
    const tokens = tokenize(text);
    const scores = {};
    const words = tokens.join(' ');

    for (const cat in table) {
      let score = 0;
      for (const kw of table[cat]) {
        if (words.includes(kw)) {
          score += 1 + (tokens.includes(kw) ? 1 : 0);
        }
      }
      scores[cat] = score;
    }

    // Laplace-smoothed probability-like confidence so results are comparable.
    const total = tokens.length || 1;
    const out = {};
    for (const cat in scores) {
      out[cat] = (scores[cat] + 0.01) / total;
    }
    return out;
  }

  function predictType(text) {
    const lower = String(text || '').toLowerCase();
    let incomeScore = 0;
    let expenseScore = 0;
    const words = tokenize(lower);

    for (const kw of INCOME_KEYWORDS) {
      if (words.includes(kw)) incomeScore += 1;
      if (lower.includes(kw)) incomeScore += 0.5;
    }
    if (/debited|debit|paid|spent|payment|withdrawal|charged/i.test(lower)) {
      expenseScore += 1;
    }

    const total = incomeScore + expenseScore;
    const type = incomeScore > expenseScore ? 'income' : 'expense';
    const confidence = total === 0 ? 0.5 : Math.max(incomeScore, expenseScore) / total;
    return { type, confidence: Math.min(1, confidence) };
  }

  /**
   * Classify a bank SMS message.
   * @param {string} text - raw SMS text
   * @returns {object} { category, type, confidence, amount, merchant, date }
   */
  function classify(text) {
    const typeResult = predictType(text);

    if (typeResult.type === 'income') {
      const words = tokenize(text);
      const salaryCat = ['salary', 'payroll', 'wages', 'sal', 'pf'].some((w) => words.includes(w));
      const category = salaryCat ? 'salary' : 'other';
      const amount = extractAmount(text);
      return {
        category,
        type: 'income',
        confidence: Math.max(typeResult.confidence, salaryCat ? 0.75 : 0.5),
        amount,
        merchant: extractMerchant(text, typeResult.type),
        date: extractDate(text)
      };
    }

    // Expense: pick category with the highest score.
    const catScores = computeScores(text, TRAINING);
    let bestCat = 'other';
    let bestScore = 0;
    for (const cat in catScores) {
      if (cat === 'salary') continue;
      if (catScores[cat] > bestScore) {
        bestScore = catScores[cat];
        bestCat = cat;
      }
    }

    // Combine type confidence with category confidence.
    const confidence = Math.min(1, (typeResult.confidence + bestScore) / 2 || 0.5);

    return {
      category: bestCat,
      type: typeResult.type,
      confidence: Math.max(0.4, confidence),
      amount: extractAmount(text),
      merchant: extractMerchant(text, typeResult.type),
      date: extractDate(text)
    };
  }

  function extractAmount(text) {
    const m = String(text || '').match(/(?:rs\.?|inr|rupees|\$|€|£|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (m) return parseFloat(m[1].replace(/,/g, '')) || null;
    const m2 = String(text || '').match(/(?:debited|credited)\s*[a-z.]*\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (m2) return parseFloat(m2[1].replace(/,/g, '')) || null;
    const m3 = String(text || '').match(/([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|inr)/i);
    if (m3) return parseFloat(m3[1].replace(/,/g, '')) || null;
    return null;
  }

  function extractDate(text) {
    const m = String(text || '').match(/(\d{2})[\-/.](\d{2})[\-/.](\d{2,4})/);
    if (!m) return null;
    const [, d, mo, y] = m;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${mo}-${d}`;
  }

  const NOISE_WORDS = new Set([
    'debited', 'credited', 'debit', 'credit', 'your', 'payment', 'received',
    'account', 'from', 'for', 'with', 'ref', 'up to', 'via', 'at', 'on',
    'order', 'was', 'the', 'and', 'info', 'bharat', 'id', 'number', 'uic',
    'bank', 'rs', 'a', 'ac', 'spent'
  ]);

  // Generic category words that make poor merchant names.
  const GENERIC_MERCHANT_WORDS = new Set([
    'food', 'restaurant', 'hotel', 'grocery', 'supermarket', 'dining', 'meal',
    'transport', 'taxi', 'cab', 'fare', 'travel', 'ticket', 'flight', 'booking',
    'shopping', 'mall', 'store', 'purchase', 'retail', 'bill', 'utility', 'electricity',
    'water', 'recharge', 'rent', 'maintenance', 'school', 'college', 'fee', 'tuition',
    'hospital', 'clinic', 'pharmacy', 'medicine', 'medical', 'salary', 'deposit',
    'credits', 'payroll', 'refund', 'cashback', 'wages', 'other', 'salary credited'
  ]);

  function extractMerchant(text, type) {
    const words = tokenize(text);
    for (const w of words) {
      const base = w.replace(/\.com$/, '').replace(/\.in$/, '');
      if (
        base.length >= 3 &&
        !NOISE_WORDS.has(w) &&
        !GENERIC_MERCHANT_WORDS.has(w) &&
        !GENERIC_MERCHANT_WORDS.has(base) &&
        !/^\d+$/.test(w) &&
        !/^(a\/c|upi|xx\d+)/.test(w)
      ) {
        return base.charAt(0).toUpperCase() + base.slice(1);
      }
    }
    return type === 'income' ? 'Deposit' : 'Bank';
  }

  const CATEGORY_LABELS = {
    food: 'Food & Dining',
    transport: 'Transport',
    shopping: 'Shopping',
    utilities: 'Utilities',
    entertainment: 'Entertainment',
    health: 'Health',
    housing: 'Housing / Rent',
    education: 'Education',
    travel: 'Travel',
    salary: 'Salary',
    other: 'Other'
  };

  return { classify, CATEGORY_LABELS, CATEGORIES };
})();

export default NaiveBayes;