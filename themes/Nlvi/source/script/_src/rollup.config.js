const { nodeResolve } = require('@rollup/plugin-node-resolve')
const terser = require('@rollup/plugin-terser')

module.exports = {
  input: 'src/banderole.js',
  plugins: [
    nodeResolve(),
    terser({
      compress: {
        pure_getters: true
      },
      output: {
        comments: false
      }
    })
  ],
  output: {
    file: '../scheme/banderole.js',
    name: 'Nlvi',
    format: 'umd'
  }
}
