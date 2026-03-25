import axios from '../axios'
import services from '../services'

const installServices = app => {
  app.config.globalProperties.$http = axios

  services.forEach(service => {
    app.config.globalProperties[`$${service.name}`] = service[service.name]
  })
}

export {
  installServices
}
