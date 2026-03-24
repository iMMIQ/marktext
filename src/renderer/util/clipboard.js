import nativeClipboard from '@/services/nativeApi/clipboard'

export const guessClipboardFilePath = () => {
  try {
    const filePath = nativeClipboard.readFilePathSync()
    return typeof filePath === 'string' ? filePath : ''
  } catch {
    return ''
  }
}
