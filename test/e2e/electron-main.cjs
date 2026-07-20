const path = require('path')
const electron = require('electron')

const calls = []
const record = method => { calls.push(method) }
const { dialog } = electron

dialog.__marktextE2ENativeDialogsBlocked = true
dialog.__marktextE2ENativeDialogCalls = calls
dialog.showOpenDialog = async () => {
  record('showOpenDialog')
  return { canceled: true, filePaths: [] }
}
dialog.showOpenDialogSync = () => {
  record('showOpenDialogSync')
  return undefined
}
dialog.showSaveDialog = async () => {
  record('showSaveDialog')
  return { canceled: true, filePath: undefined }
}
dialog.showSaveDialogSync = () => {
  record('showSaveDialogSync')
  return undefined
}
dialog.showMessageBox = async () => {
  record('showMessageBox')
  return { response: 1, checkboxChecked: false }
}
dialog.showMessageBoxSync = () => {
  record('showMessageBoxSync')
  return 1
}
dialog.showErrorBox = () => { record('showErrorBox') }
dialog.showCertificateTrustDialog = async () => {
  record('showCertificateTrustDialog')
}

electron.app.on('web-contents-created', (_event, contents) => {
  contents.print = (_options, callback) => {
    record('webContents.print')
    // Electron's print callback receives a success boolean, not an error.
    // eslint-disable-next-line n/no-callback-literal
    if (callback) callback(false, 'Native printing is blocked in E2E')
  }
})

require(path.resolve(__dirname, '../../dist/electron/main.js'))
