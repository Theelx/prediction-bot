const config = require('../../config.json');
const mysql = require('mysql');
const util = require('util');

class MySQLModel {
  constructor() {
    this.db = mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: config.DB_PASSWORD,
      database: 'predictions'
    });

    this.db.connect((err) => {
      if (err) {
        throw err;
      }
      console.log('Connected to MySQL');
    });

    this.query = util.promisify(this.db.query).bind(this.db);
  }

  async isRegistered(id) {
    const sql = 'SELECT id FROM users WHERE id = ?';
    const data = await this.query(sql, [id]);
    return data.length > 0;
  }

  async getUser(id) {
    const sql = 'SELECT username, points FROM users WHERE id = ?';
    const data = await this.query(sql, [id]);
    if (data.length !== 1) {
      throw new Error('Invalid ID');
    }
    return data[0];
  }

  async setUser(id, username, balance) {
    const sql = 'INSERT INTO users (id, username, points) VALUES (?, ?, ?)';
    await this.query(sql, [id, username, balance]);
  }

  async getPoints(id) {
    const sql = 'SELECT points FROM users WHERE id = ?';
    const data = await this.query(sql, [id]);
    if (data.length !== 1) {
      throw new Error('Invalid ID');
    }
    return data[0].points;
  }

  async setPoints(id, balance) {
    const sql = 'UPDATE users SET points = ? WHERE id = ?';
    await this.query(sql, [balance, id]);
  }

  async getLeaderboard() {
    const sql = 'SELECT username, points FROM users ORDER BY points DESC';
    return this.query(sql);
  }

  // predictions

  async createPrediction(id, question, allowedAnswersStr) {
    const sql = `
      INSERT INTO predictions (id, question, allowed_answers, is_open)
      VALUES (?, ?, ?, TRUE)
    `;
    const res = await this.query(sql, [id, question, allowedAnswersStr]);
    return res.insertId;
  }

  async isPredictionOpen(predictionNumber) {
    const sql = 'SELECT is_open FROM predictions WHERE prediction_number = ?';
    const rows = await this.query(sql, [predictionNumber]);
    if (rows.length !== 1) {
      return false;
    }
    return !!rows[0].is_open;
  }

  async setPredictionOpen(predictionNumber, isOpen) {
    const sql = 'UPDATE predictions SET is_open = ? WHERE prediction_number = ?';
    await this.query(sql, [isOpen ? 1 : 0, predictionNumber]);
  }

  async getOpenPredictions(limit = 25) {
    const sql = `
      SELECT prediction_number, question
      FROM predictions
      WHERE is_open = TRUE
      ORDER BY prediction_number DESC
      LIMIT ?
    `;
    return this.query(sql, [limit]);
  }

  async getAllowedAnswers(predictionNumber) {
    const sql = `
      SELECT allowed_answers
      FROM predictions
      WHERE prediction_number = ?
      LIMIT 1
    `;
    const rows = await this.query(sql, [predictionNumber]);
    if (rows.length !== 1) {
      return [];
    }
    const str = rows[0].allowed_answers || '';
    return str.split(';-').map(s => s.trim()).filter(Boolean);
  }

  // bets

  async getUserBetForPrediction(id, predictionNumber) {
    const sql = `
      SELECT predicted_outcome, bet_amount
      FROM bets
      WHERE id = ? AND prediction_number = ?
      LIMIT 1
    `;
    const rows = await this.query(sql, [id, predictionNumber]);
    return rows.length ? rows[0] : null;
  }

  // replace-or-insert a user's bet row with the aggregated bet_amount
  // we calculate newAmount in the caller and do a delete+insert for simplicity
  async saveBet({ id, username, predictionNumber, predictedOutcome, betAmount }) {
    const delSql = 'DELETE FROM bets WHERE id = ? AND prediction_number = ?';
    await this.query(delSql, [id, predictionNumber]);

    const insSql = `
      INSERT INTO bets (id, username, prediction_number, predicted_outcome, bet_amount)
      VALUES (?, ?, ?, ?, ?)
    `;
    await this.query(insSql, [id, username, predictionNumber, predictedOutcome, betAmount]);
  }

  async getBetsForPrediction(predictionNumber) {
    const sql = `
      SELECT id, predicted_outcome, bet_amount
      FROM bets
      WHERE prediction_number = ?
    `;
    return this.query(sql, [predictionNumber]);
  }

  async getBetsForPredictionByOutcome(predictionNumber, outcome) {
    const sql = `
      SELECT id, bet_amount
      FROM bets
      WHERE prediction_number = ? AND predicted_outcome = ?
    `;
    return this.query(sql, [predictionNumber, outcome]);
  }

  async getPredictionOwnerId(predictionNumber) {
    const sql = `
      SELECT id
      FROM predictions
      WHERE prediction_number = ?
      LIMIT 1
    `;
    const rows = await this.query(sql, [predictionNumber]);
    if (rows.length !== 1) {
      return null;
    }
    const val = rows[0].id;
    return (val === null || val === undefined) ? null : String(val);
  }
}

module.exports = {
  model: MySQLModel
};