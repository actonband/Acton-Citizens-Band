const path = require("node:path");
const Dotenv = require("dotenv-webpack");

module.exports = {
  mode: "production",
  target: "node",
  entry: "./scripts/render.tsx",
  output: {
    path: path.join(__dirname, ".render"),
    filename: "render.cjs",
    library: { type: "commonjs2" },
    clean: true,
  },
  resolve: { extensions: [".tsx", ".ts", ".js"] },
  externals: [
    ({ request }, callback) => {
      if (request && !request.startsWith(".") && !path.isAbsolute(request))
        return callback(null, "commonjs " + request);
      callback();
    },
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: { loader: "ts-loader", options: { transpileOnly: true } },
        exclude: /node_modules/,
      },
      { test: /\.scss$/, type: "asset/source" },
    ],
  },
  optimization: { minimize: false },
  plugins: [new Dotenv({ systemvars: true })],
};
