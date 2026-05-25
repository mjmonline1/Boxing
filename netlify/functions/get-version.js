const { version } = require('../../package.json');

exports.handler = async () => ({
  statusCode: 200,
  body: JSON.stringify({ version })
});
