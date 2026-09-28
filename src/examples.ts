import application from "./examples/application.md?raw";
import minutes from "./examples/minutes.md?raw";
import presentation from "./examples/presentation.md?raw";
import research from "./examples/research.md?raw";

const TEXTS: Readonly<Record<string, string>> = {
  application,
  minutes,
  presentation,
  research,
};

export function exampleText(id: string): string | undefined {
  return TEXTS[id];
}
