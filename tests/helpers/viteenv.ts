import { registerHooks } from "node:module";
import { load, resolve } from "./viteenvhook.ts";

registerHooks({ resolve, load });
