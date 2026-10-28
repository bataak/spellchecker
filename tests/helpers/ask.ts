export async function answer(label: string): Promise<void> {
  for (let tries = 0; tries < 100; tries++) {
    const found = [
      ...document.querySelectorAll<HTMLButtonElement>(".ask-dialog button"),
    ].find((node) => node.textContent === label);
    if (found) return found.click();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("асуулт гарсангүй: " + label);
}

export const asks = (): string[] =>
  [...document.querySelectorAll(".ask-dialog .suggest-title")].map(
    (node) => node.textContent ?? "",
  );
