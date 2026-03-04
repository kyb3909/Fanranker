import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "..", "public");
const input = path.join(dir, "logo-brush.png");
const output = path.join(dir, "logo-brush.webp");

sharp(input)
  .webp({ quality: 85 })
  .toFile(output)
  .then(() => console.log("Created logo-brush.webp"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
