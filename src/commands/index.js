module.exports = {
  // general
  predict: require('./general/predict'),
  balance: require('./general/balance'),
  register: require('./general/register'),
  leaderboard: require('./general/leaderboard'),
  openpredictions: require('./general/openpredictions'),

  // admin
  question: require('./admin/question'),
  close: require('./admin/close'),
  refund: require('./admin/refund'),
  result: require('./admin/result'),
  setpoints: require('./admin/setpoints'),
};
