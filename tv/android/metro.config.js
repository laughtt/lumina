const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');

const shared = path.resolve(__dirname, '../shared');
const config = {
  watchFolders: [shared],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
    resolveRequest: (context, moduleName, platform) => {
      const fromShared = context.originModulePath.startsWith(shared);
      const ctx = fromShared && /^react(-native)?(\/|$)/.test(moduleName)
        ? {...context, originModulePath: path.join(__dirname, 'index.js')}
        : context;
      return ctx.resolveRequest(ctx, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
