import {NxModuleFederationPlugin} from "@poc/mf-function";


// eslint-disable-next-line @typescript-eslint/no-var-requires
const browserConfig = require('./module-federation.config');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const serverConfig = require('./module-federation.server.config');

module.exports = {
  plugins: [
    new NxModuleFederationPlugin({
      browserConfig,
      serverConfig
    })
  ]
};
