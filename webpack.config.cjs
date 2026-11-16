const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const Dotenv = require("dotenv-webpack");

module.exports = {
  mode: process.env.NODE_ENV === "production" ? "production" : "development",
  entry: { main: "./src/index.tsx", dashboard: "./src/dashboard.tsx" },
  output: {
    path: path.join(__dirname, "build"),
    filename: "[name].[contenthash:8].js",
    chunkFilename: "[name].[contenthash:8].js",
    clean: true,
    publicPath: "/",
  },
  optimization: { runtimeChunk: "single" },
  resolve: {
    alias: { "acb-fonts": path.join(__dirname, "public/font") },
    extensions: [".tsx", ".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.s[ac]ss$/i,
        use: [
          MiniCssExtractPlugin.loader,
          "css-loader",
          {
            loader: "sass-loader",
            options: { api: "modern" },
          },
        ],
      },
      {
        test: /\.(png|jpe?g|gif|svg|eot|ttf|woff|woff2)$/i,
        type: "asset/resource",
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.join(__dirname, "public", "index.html"),
      inject: "body",
      filename: "index.html",
      chunks: ["main"],
      // The prerender step replaces the root and metadata in this template.
      minify: {
        collapseWhitespace: true,
        removeComments: true,
        removeAttributeQuotes: false,
        minifyCSS: true,
        minifyJS: true,
      },
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, "public", "dashboard.html"),
      filename: "dashboard/index.html",
      chunks: ["dashboard"],
    }),
    new MiniCssExtractPlugin({
      filename: "[name].[contenthash:8].css",
    }),
    new CopyPlugin({
      patterns: [
        {
          from: "public",
          to: ".",
          globOptions: {
            ignore: [
              "**/index.html",
              "**/dashboard.html",
              "**/*bkp*",
              "**/.DS_Store",
              "**/AGENTS.md",
              "**/local/**",
              "**/font/**/*.ttf",
              "**/img/photos/**",
              "**/favicon.ico",
              "**/favicon.png",
            ],
          },
        },
      ],
    }),
    new Dotenv({ systemvars: true }),
  ],
  devServer: {
    static: path.join(__dirname, "public"),
    compress: true,
    port: 3000,
    historyApiFallback: {
      rewrites: [
        { from: /^\/dashboard\/?$/, to: "/dashboard/index.html" },
        { from: /^\/__\/auth\/action\/?$/, to: "/dashboard/index.html" },
      ],
    },
  },
};
