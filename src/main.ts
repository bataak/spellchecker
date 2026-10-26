import "./style.css";
import "./editor/gutter.css";
import "./mdbar/md-toolbar.css";
import "./ui/scrollhint.css";
import "./export/export.css";
import "./define/deftip.css";
import "./project/project.css";
import "./collab/collab.css";
import "./spellui/dictmanager.css";
import { installErrorLog } from "./core/errorlog.ts";
import { createLate } from "./core/late.ts";
import type { AppParts } from "./app/appparts.ts";
import { composeApp } from "./app/compose.ts";

installErrorLog();

const app = createLate<AppParts>();
app.provide({ entryUrl: import.meta.url });

composeApp(app);
