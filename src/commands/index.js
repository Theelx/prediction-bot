module.exports = {
  // general
  predict: require('./general/predict'),
  balance: require('./general/balance'),
  register: require('./general/register'),
  leaderboard: require('./general/leaderboard'),
  openpredictions: require('./general/openpredictions'),
  question: require('./general/question'),

  // admin
  close: require('./admin/close'),
  refund: require('./admin/refund'),
  result: require('./admin/result'),
  setpoints: require('./admin/setpoints'),
};
