import application from "../examples/application.md?raw";
import article from "../examples/article.tex?raw";
import minutes from "../examples/minutes.md?raw";
import presentation from "../examples/presentation.md?raw";
import research from "../examples/research.md?raw";

const TEXTS: Readonly<Record<string, string>> = {
  application,
  article,
  minutes,
  presentation,
  research,
};

export function exampleText(id: string): string | undefined {
  return TEXTS[id];
}
