'use strict'

const path = require('path')
const thirdPartyChecker = require('./licenses/thirdPartyChecker')
const rootDir = path.resolve(__dirname, '..')

thirdPartyChecker.validateLicenses(rootDir)
