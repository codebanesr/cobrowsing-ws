const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    background: './src/background.js',
    content: './src/content.js',
    popup: './src/popup.js',
    injected: './src/injected.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  mode: 'production',
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'public', to: '.' }
      ],
    }),
  ],
};