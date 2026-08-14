import path from "node:path";
import { config } from "dotenv";
import { migrate } from "./migrate.js";

config({ path: path.resolve(process.cwd(), "../../.env") });
config();

await migrate();
console.log("Database migration complete.");
