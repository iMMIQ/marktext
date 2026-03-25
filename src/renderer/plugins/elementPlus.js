import ElementPlus from 'element-plus'
import locale from 'element-plus/es/locale/lang/en'

const installElementPlus = app => {
  app.use(ElementPlus, {
    locale
  })
}

export {
  installElementPlus
}
