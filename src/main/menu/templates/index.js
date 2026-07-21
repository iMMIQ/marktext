import edit from './edit'
import prefEdit from './prefEdit'
import file from './file'
import help from './help'
import marktext from './marktext'
import view from './view'
import window from './window'
import paragraph from './paragraph'
import format from './format'
import theme from './theme'
import dockMenu from './dock'
import { localizeMenuTemplate } from 'common/i18n'

export { dockMenu }

/**
 * Create the setting window menu.
 *
 * @param {Keybindings} keybindings The keybindings instance
 */
export const configSettingMenu = (keybindings, preferences) => {
  const template = [
    ...(process.platform === 'darwin' ? [marktext(keybindings)] : []),
    prefEdit(keybindings),
    help()
  ]
  return localizeMenuTemplate(template, preferences.getItem('language'))
}

/**
 * Create the application menu for the editor window.
 *
 * @param {Keybindings} keybindings The keybindings instance.
 * @param {Preference} preferences The preference instance.
 * @param {string[]} recentlyUsedFiles The recently used files.
 */
export default function (keybindings, preferences, recentlyUsedFiles) {
  const template = [
    ...(process.platform === 'darwin' ? [marktext(keybindings)] : []),
    file(keybindings, preferences, recentlyUsedFiles),
    edit(keybindings),
    paragraph(keybindings),
    format(keybindings),
    window(keybindings),
    theme(preferences),
    view(keybindings),
    help()
  ]
  return localizeMenuTemplate(template, preferences.getItem('language'))
}
