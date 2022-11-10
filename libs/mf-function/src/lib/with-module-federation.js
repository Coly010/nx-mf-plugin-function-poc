"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withModuleFederation = void 0;
const tslib_1 = require("tslib");
const devkit_1 = require("@nrwl/devkit");
const project_graph_1 = require("nx/src/project-graph/project-graph");
const path_1 = require("path");
const mf_webpack_1 = require("./mf-webpack");
const utils_1 = require("./utils");
const ModuleFederationPlugin = require("webpack/lib/container/ModuleFederationPlugin");
const {UniversalFederationPlugin} = require("@module-federation/node");

function determineRemoteUrl(remote) {
    const remoteProjectConfiguration = (0, project_graph_1.readCachedProjectConfiguration)(remote);
    let publicHost = '';
    try {
        publicHost = remoteProjectConfiguration.targets.serve.options.publicHost;
    }
    catch (error) {
        throw new Error(`Cannot automatically determine URL of remote (${remote}). Looked for property "publicHost" in the project's "serve" target.\n
      You can also use the tuple syntax in your webpack config to configure your remotes. e.g. \`remotes: [['remote1', 'http://localhost:4201']]\``);
    }
    return `${publicHost.endsWith('/') ? publicHost.slice(0, -1) : publicHost}/remoteEntry.mjs`;
}
function mapRemotes(remotes, isServer) {
    const mappedRemotes = {};
    for (const remote of remotes) {
        if (Array.isArray(remote)) {
            const [remoteName, remoteLocation] = remote;
            const remoteLocationExt = (0, path_1.extname)(remoteLocation);
            mappedRemotes[remoteName] = `${isServer ? `${remoteName}@` : ''}${['.js', '.mjs'].includes(remoteLocationExt)
                ? remoteLocation
                : `${remoteLocation.endsWith('/')
                    ? remoteLocation.slice(0, -1)
                    : remoteLocation}/remoteEntry.mjs`}`;
        }
        else if (typeof remote === 'string') {
            mappedRemotes[remote] = determineRemoteUrl(remote);
        }
    }
    return mappedRemotes;
}
function applySharedFunction(sharedConfig, sharedFn) {
    if (!sharedFn) {
        return;
    }
    for (const [libraryName, library] of Object.entries(sharedConfig)) {
        const mappedDependency = sharedFn(libraryName, library);
        if (mappedDependency === false) {
            delete sharedConfig[libraryName];
            continue;
        }
        else if (!mappedDependency) {
            continue;
        }
        sharedConfig[libraryName] = mappedDependency;
    }
}
function addStringDependencyToSharedConfig(sharedConfig, dependency, projectGraph) {
    var _a, _b, _c, _d;
    if (projectGraph.nodes[dependency]) {
        sharedConfig[dependency] = { requiredVersion: false };
    }
    else if ((_a = projectGraph.externalNodes) === null || _a === void 0 ? void 0 : _a[`npm:${dependency}`]) {
        const pkgJson = (0, utils_1.readRootPackageJson)();
        const config = (0, mf_webpack_1.getNpmPackageSharedConfig)(dependency, (_c = (_b = pkgJson.dependencies) === null || _b === void 0 ? void 0 : _b[dependency]) !== null && _c !== void 0 ? _c : (_d = pkgJson.devDependencies) === null || _d === void 0 ? void 0 : _d[dependency]);
        if (!config) {
            return;
        }
        sharedConfig[dependency] = config;
    }
    else {
        throw new Error(`The specified dependency "${dependency}" in the additionalShared configuration does not exist in the project graph. ` +
            `Please check your additionalShared configuration and make sure you are including valid workspace projects or npm packages.`);
    }
}
function applyAdditionalShared(sharedConfig, additionalShared, projectGraph) {
    if (!additionalShared) {
        return;
    }
    for (const shared of additionalShared) {
        if (typeof shared === 'string') {
            addStringDependencyToSharedConfig(sharedConfig, shared, projectGraph);
        }
        else if (Array.isArray(shared)) {
            sharedConfig[shared[0]] = shared[1];
        }
        else if (typeof shared === 'object') {
            sharedConfig[shared.libraryName] = shared.sharedConfig;
        }
    }
}
function applyDefaultEagerPackages(sharedConfig) {
    const DEFAULT_PACKAGES_TO_LOAD_EAGERLY = [
        '@angular/localize',
        '@angular/localize/init',
    ];
    for (const pkg of DEFAULT_PACKAGES_TO_LOAD_EAGERLY) {
        if (!sharedConfig[pkg]) {
            continue;
        }
        sharedConfig[pkg] = Object.assign(Object.assign({}, sharedConfig[pkg]), { eager: true });
    }
}
function withModuleFederation(options) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        const DEFAULT_NPM_PACKAGES_TO_AVOID = ['zone.js', '@nrwl/angular/mf'];
        const DEFAULT_ANGULAR_PACKAGES_TO_SHARE = [
            '@angular/animations',
            '@angular/common',
        ];
        let projectGraph;
        try {
            projectGraph = (0, devkit_1.readCachedProjectGraph)();
        }
        catch (e) {
            projectGraph = yield (0, devkit_1.createProjectGraphAsync)();
        }
        const dependencies = (0, utils_1.getDependentPackagesForProject)(projectGraph, options.name);
        const sharedLibraries = (0, mf_webpack_1.shareWorkspaceLibraries)(dependencies.workspaceLibraries);
        const npmPackages = (0, mf_webpack_1.sharePackages)(Array.from(new Set([
            ...DEFAULT_ANGULAR_PACKAGES_TO_SHARE,
            ...dependencies.npmPackages.filter((pkg) => !DEFAULT_NPM_PACKAGES_TO_AVOID.includes(pkg)),
        ])));
        DEFAULT_NPM_PACKAGES_TO_AVOID.forEach((pkgName) => {
            if (pkgName in npmPackages) {
                delete npmPackages[pkgName];
            }
        });
        const sharedDependencies = Object.assign(Object.assign({}, sharedLibraries.getLibraries()), npmPackages);
        applyDefaultEagerPackages(sharedDependencies);
        applySharedFunction(sharedDependencies, options.shared);
        applyAdditionalShared(sharedDependencies, options.additionalShared, projectGraph);
        const mappedRemotes = !options.remotes || options.remotes.length === 0
            ? {}
            : mapRemotes(options.remotes, options.isServer);
        return (config) => ({
              ...(config ?? {}),
              target: options.isServer ? false : 'web',
              output: {
                ...(config.output ?? {}),
                uniqueName: options.name,
                ...(options.isServer ? {} :{publicPath: 'auto'}),
              },
              optimization: {
                ...(config.optimization ?? {}),
                runtimeChunk: false,
              },
              resolve: {
                ...(config.resolve ?? {}),
                alias: {
                  ...(config.resolve?.alias ?? {}),
                  ...sharedLibraries.getAliases(),
                },
              },
              experiments: {
                ...(config.experiments ?? {}),
                outputModule: !options.isServer,
              },
              plugins: [
                ...(config.plugins ?? []),
                    new UniversalFederationPlugin({
                        name: options.name,
                        filename: options.isServer ? 'remoteEntry.js' : 'remoteEntry.mjs',
                        exposes: options.exposes,
                      isServer: options.isServer,
                        remotes: mappedRemotes,
                        shared: Object.assign({}, sharedDependencies),
                        library: {
                            type: options.isServer ? 'commonjs-module' : 'module',
                        },
                    }),
                    sharedLibraries.getReplacementPlugin(),
                ]
        });
    });
}
exports.withModuleFederation = withModuleFederation;
//# sourceMappingURL=with-module-federation.js.map
