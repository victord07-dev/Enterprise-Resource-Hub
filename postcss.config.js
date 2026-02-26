import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import postcss from "postcss";
import path from "path";

const indexCss = path.resolve("client/src/index.css");

const fixSourcePlugin = () => ({
  postcssPlugin: "fix-tailwind-source",
  Once(root, { result }) {
    const from = result.opts.from || indexCss;
    const dummyInput = new postcss.Input("", { from });
    root.walk((node) => {
      if (!node.source?.input?.file) {
        node.source = { input: dummyInput, start: { line: 1, column: 1, offset: 0 } };
      }
    });
  },
});
fixSourcePlugin.postcss = true;

export default {
  plugins: [tailwindcss(), fixSourcePlugin(), autoprefixer()],
}
