const ODF_FONTS: Readonly<Record<string, string>> = {
  "Times New Roman": "Liberation Serif",
  Arial: "Liberation Sans",
  "Courier New": "Liberation Mono",
};

export function odfFont(family: string): string {
  return ODF_FONTS[family] ?? family;
}
