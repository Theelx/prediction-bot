class State {
  constructor(model) {
    this.model = model;
    // Cache: Map<predictionNumber, { open: boolean, allowedAnswers: string[], books: Map<outcomeLower, Map<userId, {id, amount}>> }>
    this.markets = new Map();
  }

  async _loadMarketIfNeeded(predictionNumber) {
    if (this.markets.has(predictionNumber)) {
      return this.markets.get(predictionNumber);
    }

    const isOpen = await this.model.isPredictionOpen(predictionNumber);
    const allowedAnswers = await this.model.getAllowedAnswers(predictionNumber);
    if (!allowedAnswers.length) {
      throw new Error('Unknown prediction number.');
    }

    const books = new Map();
    allowedAnswers.forEach(a => books.set(a.toLowerCase(), new Map()));
    const m = { open: isOpen, allowedAnswers, books };
    this.markets.set(predictionNumber, m);
    return m;
  }

  openPredictions(predictionNumber, allowedAnswers) {
    const canonical = (allowedAnswers || []).map(a => a.trim()).filter(Boolean);
    const books = new Map();
    canonical.forEach(a => books.set(a.toLowerCase(), new Map()));
    this.markets.set(predictionNumber, { open: true, allowedAnswers: canonical, books });
  }

  closePrediction(predictionNumber) {
    const m = this.markets.get(predictionNumber);
    if (m) {
      m.open = false;
    }
  }

  isPredictionOpen(predictionNumber) {
    const m = this.markets.get(predictionNumber);
    return !!(m && m.open);
  }

  async getAllowedAnswers(predictionNumber) {
    const m = await this._loadMarketIfNeeded(predictionNumber);
    return m.allowedAnswers;
  }

  _ensureOutcomeAllowed(market, outcome) {
    const key = outcome.toLowerCase();
    if (!market.books.has(key)) {
      throw new Error(`Please specify one of: ${market.allowedAnswers.join(', ')}.`);
    }
    return key;
  }

  // add/accumulate a bet (DB is SoT for amounts)
  // also prevents cross-outcome bets by checking existing DB row
  async addPrediction(predictionNumber, id, outcome, amount) {
    const m = await this._loadMarketIfNeeded(predictionNumber);
    if (!m.open) {
      throw new Error('Predictions are closed for that market.');
    }

    const key = this._ensureOutcomeAllowed(m, outcome);

    // check existing DB bet to prevent cross-outcome
    const existing = await this.model.getUserBetForPrediction(id, predictionNumber);
    if (existing && existing.predicted_outcome !== key) {
      const other = m.allowedAnswers.find(a => a.toLowerCase() === existing.predicted_outcome) || existing.predicted_outcome;
      throw new Error(`You cannot vote on ${outcome} as you have already voted on ${other}.`);
    }

    const newAmount = (existing ? Number(existing.bet_amount) : 0) + amount;

    // persist aggregated amount
    const user = await this.model.getUser(id);
    await this.model.saveBet({
      id,
      username: user.username,
      predictionNumber,
      predictedOutcome: key,
      betAmount: newAmount
    });

    // update in-memory (optional, for quick summaries)
    const book = m.books.get(key);
    const memAmt = book.has(id) ? book.get(id).amount + amount : amount;
    book.set(id, { id, amount: memAmt });
  }

  // return in-memory stakes (may be partial if market was loaded mid-stream)
  getPredictions(predictionNumber, outcome) {
    const m = this.markets.get(predictionNumber);
    if (!m) {
      return [];
    }
    if (outcome) {
      const key = this._ensureOutcomeAllowed(m, outcome);
      return Array.from(m.books.get(key).values());
    }
    return Array.from(m.books.values()).flatMap(map => Array.from(map.values()));
  }

  clearPrediction(predictionNumber) {
    this.markets.delete(predictionNumber);
  }

  // check if any market is open (or a specific one if provided)
  // uses in-memory cache only (does not query DB)
  isLive(predictionNumber) {
    if (predictionNumber !== undefined && predictionNumber !== null) {
      return this.isPredictionOpen(predictionNumber);
    }
    for (const m of this.markets.values()) {
      if (m.open) {
        return true;
      }
    }
    return false;
  }

}

module.exports = {
  state: State
};