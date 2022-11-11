import {ModuleFederationConfig} from "./models";
import {createProjectGraphAsync, ProjectGraph, readCachedProjectGraph} from "@nrwl/devkit";
import {getDependentPackagesForProject} from "./utils";
import {sharePackages, shareWorkspaceLibraries} from "./mf-webpack";
import {
  applyAdditionalShared,
  applyDefaultEagerPackages,
  applySharedFunction, determineRemoteUrl,
  mapRemotes
} from "./NxModuleFederationPluginUtils";
import {UniversalFederationPlugin} from "@module-federation/node";
import type {Compiler} from "webpack";


interface NxModuleFederationOptions {
  browserConfig: ModuleFederationConfig,
  serverConfig: ModuleFederationConfig
}

interface NxModuleFederationContext {
  UniversalFederationPlugin?: typeof import('@module-federation/node').UniversalFederationPlugin;
}

export class NxModuleFederationPlugin {
  private options: NxModuleFederationOptions;
  private context: NxModuleFederationContext;

  constructor(options: NxModuleFederationOptions, context?: NxModuleFederationContext) {
    this.options = options || {} as NxModuleFederationOptions;
    this.context = context || {} as NxModuleFederationContext;
  }

  private createConfig(isServer: boolean) {
    const options: ModuleFederationConfig = isServer ? this.options.serverConfig : this.options.browserConfig;

      const DEFAULT_NPM_PACKAGES_TO_AVOID = ['zone.js', '@nrwl/angular/mf'];
    const DEFAULT_ANGULAR_PACKAGES_TO_SHARE = [
      '@angular/animations',
      '@angular/common',
    ];

    const projectGraph = readCachedProjectGraph();

    const dependencies = getDependentPackagesForProject(
      projectGraph,
      options.name
    );
    const sharedLibraries = shareWorkspaceLibraries(
      dependencies.workspaceLibraries
    );

    const npmPackages = sharePackages(
      Array.from(
        new Set([
          ...DEFAULT_ANGULAR_PACKAGES_TO_SHARE,
          ...dependencies.npmPackages.filter(
            (pkg) => !DEFAULT_NPM_PACKAGES_TO_AVOID.includes(pkg)
          ),
        ])
      )
    );

    DEFAULT_NPM_PACKAGES_TO_AVOID.forEach((pkgName) => {
      if (pkgName in npmPackages) {
        delete npmPackages[pkgName];
      }
    });

    const sharedDependencies = {
      ...sharedLibraries.getLibraries(),
      ...npmPackages,
    };

    applyDefaultEagerPackages(sharedDependencies);
    applySharedFunction(sharedDependencies, options.shared);
    applyAdditionalShared(
      sharedDependencies,
      options.additionalShared,
      projectGraph
    );

    const mappedRemotes =
      !options.remotes || options.remotes.length === 0
        ? {}
        : mapRemotes(options.remotes, isServer);

    return {
      compilerOptions: {
        output: {
          uniqueName: options.name,
          ...(isServer ? {} : {publicPath: 'auto'}),
        },
        optimization: {
          runtimeChunk: false,
        },
        resolve: {
          alias: {
            ...sharedLibraries.getAliases(),
          },
        },
        experiments: {
          outputModule: isServer ? false : true,
        },
      },
      universalFederationConfig: {
        name: options.name,
        filename: isServer ? 'remoteEntry.js' : 'remoteEntry.mjs',
        exposes: options.exposes,
        isServer: isServer,
        remotes: mappedRemotes,
        shared: Object.assign({}, sharedDependencies),
        library: {
          type: isServer ? 'commonjs-module' : 'module',
        },
      },
      sharedLibraries
    }
    //   plugins: [
    //     ...(originalConfig.plugins ?? []),
    //     // eslint-disable-next-line @typescript-eslint/no-var-requires
    //     new (this.context.UniversalFederationPlugin || require('@module-federation/node').UniversalFederationPlugin)(),
    //     sharedLibraries.getReplacementPlugin(),
    //   ],
    // });
  }

  apply(compiler: Compiler) {
    // @ts-ignore
    const isServer = compiler.options.name === 'server';

    // console.log(compiler, "isServer", isServer);

    const config = this.createConfig(isServer);

    if(isServer) {
      console.log(config.universalFederationConfig);
    }

    compiler.options.target = isServer ? false : compiler.options.target;
    compiler.options.output.uniqueName = config.compilerOptions.output.uniqueName;
    compiler.options.output.publicPath = config.compilerOptions.output.publicPath;
    compiler.options.output.library = {...(  compiler.options.output.library ? compiler.options.output.library : {}), type: isServer ? 'commonjs-module' : 'module'};
    compiler.options.output.scriptType = isServer ? false: 'module';
    compiler.options.optimization.runtimeChunk = config.compilerOptions.optimization.runtimeChunk;
    compiler.options.resolve.alias = {...(compiler.options.resolve.alias ?? {}), ...config.compilerOptions.resolve.alias};
    compiler.options.experiments.outputModule = config.compilerOptions.experiments.outputModule;

    if(isServer) {
      console.log(compiler.options);
    }

      // eslint-disable-next-line @typescript-eslint/no-var-requires
          new UniversalFederationPlugin(config.universalFederationConfig, {}).apply(compiler),
          config.sharedLibraries.getReplacementPlugin().apply(compiler)


  }
}
