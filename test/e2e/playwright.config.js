const path = require('path')

const config = {
  expect: {
    timeout: 10000
  },
  outputDir: path.resolve('test-results/e2e'),
  reporter: [['list']],
  timeout: 45000,
  workers: '50%',
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 720 }
  }
}
module.exports = config
