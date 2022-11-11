import {NxModuleFederationPlugin} from "@poc/mf-function";


// eslint-disable-next-line @typescript-eslint/no-var-requires
const config = require('./module-federation.config');

module.exports = {
  plugins: [
    new NxModuleFederationPlugin({
      browserConfig: config,
      serverConfig: config
    })
  ]
};
