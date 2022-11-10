const { withModuleFederation } = require('../../../libs/mf-function/src/lib/with-module-federation');
const config = require('./module-federation.server.config');
module.exports = withModuleFederation({...config, isServer: true})
