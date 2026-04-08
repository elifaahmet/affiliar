const path = require("path");
const {
  override,
  addWebpackModuleRule,
  addWebpackAlias,
} = require("customize-cra");

module.exports = override(
  addWebpackAlias({
    "@components": path.resolve(__dirname, "src/components"),
    "@icons": path.resolve(__dirname, "src/assets/icons"),
  }),
  addWebpackModuleRule({
    test: /\.svg$/,
    use: ["@svgr/webpack"],
  })
);
