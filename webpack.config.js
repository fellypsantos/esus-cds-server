const path = require('path');
const nodeExternals = require('webpack-node-externals');
const package = require('./package.json');

module.exports = {
  mode: 'production',
  entry: path.resolve(__dirname, 'index.js'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'main.server.js'
  },
  target: 'node',
  externals: [
    nodeExternals({
      whitelist: Object.keys(package.dependencies)
    })
  ]
};