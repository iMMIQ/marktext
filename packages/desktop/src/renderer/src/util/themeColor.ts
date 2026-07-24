const editorThemes = import.meta.glob<string>('../assets/themes/*.theme.css', {
  query: '?inline',
  import: 'default'
})

const prismThemes = import.meta.glob<string>('../assets/themes/prismjs/*.theme.css', {
  query: '?inline',
  import: 'default'
})

const themePath = (theme: string): string => `../assets/themes/${theme}.theme.css`
const prismThemePath = (theme: string): string =>
  `../assets/themes/prismjs/${theme}.theme.css`

export const loadThemeColor = async(theme: string): Promise<string | null> => {
  const editorThemeLoader = editorThemes[themePath(theme)]
  const prismThemeLoader = prismThemes[prismThemePath(theme === 'material-dark' ? 'dark' : theme)]
  if (!editorThemeLoader || !prismThemeLoader) return null

  const [editorTheme, prismTheme] = await Promise.all([editorThemeLoader(), prismThemeLoader()])
  return `${editorTheme}\n${prismTheme}`
}
