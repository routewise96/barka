// metro.config.js — расширяем список ассет-расширений.
// .webp Metro знает по умолчанию, а .opus (аудио паков) — нет, поэтому добавляем,
// иначе require('...opus') в реестре bundled-паков (src/content/bootstrap.ts) не забандлится.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
if (!config.resolver.assetExts.includes('opus')) {
  config.resolver.assetExts.push('opus');
}

module.exports = config;
