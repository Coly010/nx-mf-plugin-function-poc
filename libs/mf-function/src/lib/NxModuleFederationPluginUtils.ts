// @ts-nocheck

import project_graph_1 from "nx/src/project-graph/project-graph";
import path_1 from "path";
import utils_1 from "./utils";
import mf_webpack_1 from "./mf-webpack";
import devkit_1 from "@nrwl/devkit";
import fs_1 from "fs";
import typescript_1 from "@nrwl/workspace/src/utilities/typescript";
import typescript_2 from "./typescript";
import package_json_1 from "nx/src/utils/package-json";

import {extname} from 'path';

function collectWorkspaceLibrarySecondaryEntryPoints(library, tsconfigPathAliases) {
  const libraryRoot = path_1.join(devkit_1.workspaceRoot, library.root);
  const needsSecondaryEntryPointsCollected = fs_1.existsSync(path_1.join(libraryRoot, 'ng-package.json'));
  const secondaryEntryPoints = [];
  if (needsSecondaryEntryPointsCollected) {
    const tsConfigAliasesForLibWithSecondaryEntryPoints = Object.entries(tsconfigPathAliases).reduce((acc, [tsKey, tsPaths]) => {
      if (!tsKey.startsWith(library.importKey)) {
        return Object.assign({}, acc);
      }
      if (tsPaths.some((path) => path.startsWith(`${library.root}/`))) {
        acc = Object.assign(Object.assign({}, acc), { [tsKey]: tsPaths });
      }
      return acc;
    }, {});
    for (const [alias] of Object.entries(tsConfigAliasesForLibWithSecondaryEntryPoints)) {
      const pathToLib = (0, path_1.dirname)((0, path_1.join)(devkit_1.workspaceRoot, tsconfigPathAliases[alias][0]));
      let searchDir = pathToLib;
      while (searchDir !== libraryRoot) {
        if ((0, fs_1.existsSync)((0, path_1.join)(searchDir, 'ng-package.json'))) {
          secondaryEntryPoints.push({ name: alias, path: pathToLib });
          break;
        }
        searchDir = (0, path_1.dirname)(searchDir);
      }
    }
  }
  return secondaryEntryPoints;
}
function shareWorkspaceLibraries(libraries, tsConfigPath) {
  var _a;
  if (tsConfigPath === void 0) { tsConfigPath = (_a = process.env.NX_TSCONFIG_PATH) !== null && _a !== void 0 ? _a : (0, typescript_1.getRootTsConfigPath)(); }
  if (!libraries) {
    return getEmptySharedLibrariesConfig();
  }
  const tsconfigPathAliases = (0, typescript_2.readTsPathMappings)(tsConfigPath);
  if (!Object.keys(tsconfigPathAliases).length) {
    return getEmptySharedLibrariesConfig();
  }
  const pathMappings = [];
  for (const [key, paths] of Object.entries(tsconfigPathAliases)) {
    const library = libraries.find((lib) => lib.importKey === key);
    if (!library) {
      continue;
    }
    collectWorkspaceLibrarySecondaryEntryPoints(library, tsconfigPathAliases).forEach(({ name, path }) => pathMappings.push({
      name,
      path,
    }));
    pathMappings.push({
      name: key,
      path: (0, path_1.normalize)((0, path_1.join)(devkit_1.workspaceRoot, paths[0])),
    });
  }
  return {
    getAliases: () => pathMappings.reduce((aliases, library) => (Object.assign(Object.assign({}, aliases), { [library.name]: library.path })), {}),
    getLibraries: (eager) => pathMappings.reduce((libraries, library) => (Object.assign(Object.assign({}, libraries), { [library.name]: { requiredVersion: false, eager } })), {}),
    getReplacementPlugin: () => new webpack_1.NormalModuleReplacementPlugin(/./, (req) => {
      if (!req.request.startsWith('.')) {
        return;
      }
      const from = req.context;
      const to = (0, path_1.normalize)((0, path_1.join)(req.context, req.request));
      for (const library of pathMappings) {
        const libFolder = (0, path_1.normalize)((0, path_1.dirname)(library.path));
        if (!from.startsWith(libFolder) &&
          to.startsWith(libFolder) &&
          !library.name.endsWith('/*')) {
          req.request = library.name;
        }
      }
    }),
  };
}
exports.shareWorkspaceLibraries = shareWorkspaceLibraries;
function getEmptySharedLibrariesConfig() {
  return {
    getAliases: () => ({}),
    getLibraries: () => ({}),
    getReplacementPlugin: () => new webpack_1.NormalModuleReplacementPlugin(/./, () => { }),
  };
}
function getNonNodeModulesSubDirs(directory) {
  return (0, fs_1.readdirSync)(directory)
    .filter((file) => file !== 'node_modules')
    .map((file) => (0, path_1.join)(directory, file))
    .filter((file) => (0, fs_1.lstatSync)(file).isDirectory());
}
function recursivelyCollectSecondaryEntryPointsFromDirectory(pkgName, pkgVersion, pkgRoot, mainEntryPointExports, directories, collectedPackages) {
  for (const directory of directories) {
    const packageJsonPath = (0, path_1.join)(directory, 'package.json');
    const relativeEntryPointPath = (0, path_1.relative)(pkgRoot, directory);
    const entryPointName = (0, devkit_1.joinPathFragments)(pkgName, relativeEntryPointPath);
    if ((0, fs_1.existsSync)(packageJsonPath)) {
      try {
        // require the secondary entry point to try to rule out sample code
        require.resolve(entryPointName, { paths: [devkit_1.workspaceRoot] });
        const { name } = (0, devkit_1.readJsonFile)(packageJsonPath);
        // further check to make sure what we were able to require is the
        // same as the package name
        if (name === entryPointName) {
          collectedPackages.push({ name, version: pkgVersion });
        }
      }
      catch (_a) { }
    }
    else if (mainEntryPointExports) {
      // if the package.json doesn't exist, check if the directory is
      // exported by the main entry point
      const entryPointExportKey = `./${relativeEntryPointPath}`;
      const entryPointInfo = mainEntryPointExports[entryPointExportKey];
      if (entryPointInfo) {
        collectedPackages.push({
          name: entryPointName,
          version: pkgVersion,
        });
      }
    }
    const subDirs = getNonNodeModulesSubDirs(directory);
    recursivelyCollectSecondaryEntryPointsFromDirectory(pkgName, pkgVersion, pkgRoot, mainEntryPointExports, subDirs, collectedPackages);
  }
}
function collectPackageSecondaryEntryPoints(pkgName, pkgVersion, collectedPackages) {
  let pathToPackage;
  let packageJsonPath;
  let packageJson;
  try {
    ({ path: packageJsonPath, packageJson } = (0, package_json_1.readModulePackageJson)(pkgName));
    pathToPackage = (0, path_1.dirname)(packageJsonPath);
  }
  catch (_a) {
    // the package.json might not resolve if the package has the "exports"
    // entry and is not exporting the package.json file, fall back to trying
    // to find it from the top-level node_modules
    pathToPackage = (0, path_1.join)(devkit_1.workspaceRoot, 'node_modules', pkgName);
    packageJsonPath = (0, path_1.join)(pathToPackage, 'package.json');
    if (!(0, fs_1.existsSync)(packageJsonPath)) {
      // might not exist if it's nested in another package, just return here
      return;
    }
    packageJson = (0, devkit_1.readJsonFile)(packageJsonPath);
  }
  const { exports } = packageJson;
  const subDirs = getNonNodeModulesSubDirs(pathToPackage);
  recursivelyCollectSecondaryEntryPointsFromDirectory(pkgName, pkgVersion, pathToPackage, exports, subDirs, collectedPackages);
}
function getNpmPackageSharedConfig(pkgName, version) {
  if (!version) {
    devkit_1.logger.warn(`Could not find a version for "${pkgName}" in the root "package.json" ` +
      'when collecting shared packages for the Module Federation setup. ' +
      'The package will not be shared.');
    return undefined;
  }
  return { singleton: true, strictVersion: true, requiredVersion: version };
}
exports.getNpmPackageSharedConfig = getNpmPackageSharedConfig;
function sharePackages(packages) {
  const pkgJson = (0, utils_1.readRootPackageJson)();
  const allPackages = [];
  packages.forEach((pkg) => {
    var _a, _b, _c;
    const pkgVersion = (_b = (_a = pkgJson.dependencies) === null || _a === void 0 ? void 0 : _a[pkg]) !== null && _b !== void 0 ? _b : (_c = pkgJson.devDependencies) === null || _c === void 0 ? void 0 : _c[pkg];
    allPackages.push({ name: pkg, version: pkgVersion });
    collectPackageSecondaryEntryPoints(pkg, pkgVersion, allPackages);
  });
  return allPackages.reduce((shared, pkg) => {
    const config = getNpmPackageSharedConfig(pkg.name, pkg.version);
    if (config) {
      shared[pkg.name] = config;
    }
    return shared;
  }, {});
}
exports.sharePackages = sharePackages;

export function determineRemoteUrl(remote) {
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

export function mapRemotes(remotes, isServer) {
  const mappedRemotes = {};
  for (const remote of remotes) {
    if (Array.isArray(remote)) {
      const [remoteName, remoteLocation] = remote;
      const remoteLocationExt = extname(remoteLocation);
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
export function applySharedFunction(sharedConfig, sharedFn) {
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

export function addStringDependencyToSharedConfig(sharedConfig, dependency, projectGraph) {
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
export function applyAdditionalShared(sharedConfig, additionalShared, projectGraph) {
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


export function applyDefaultEagerPackages(sharedConfig) {
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
