const fallbackSpellcheckerApi = {
  setEnabled: async () => false,
  switchLanguage: async () => null,
  getAvailableDictionaries: async () => [],
  getCustomDictionaryWords: async () => [],
  removeCustomDictionaryWord: async () => false
}

const getSpellcheckerApi = () => {
  if (typeof window !== 'undefined' && window.mtNative && window.mtNative.spellchecker) {
    return window.mtNative.spellchecker
  }

  return fallbackSpellcheckerApi
}

export default {
  setEnabled: enabled => getSpellcheckerApi().setEnabled(enabled),
  switchLanguage: lang => getSpellcheckerApi().switchLanguage(lang),
  getAvailableDictionaries: () => getSpellcheckerApi().getAvailableDictionaries(),
  getCustomDictionaryWords: () => getSpellcheckerApi().getCustomDictionaryWords(),
  removeCustomDictionaryWord: word => getSpellcheckerApi().removeCustomDictionaryWord(word)
}
