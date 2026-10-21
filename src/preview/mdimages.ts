import {
  allowRemoteImages,
  imageUrl,
  isBlockedRemote,
  pickImage,
  prepareImage,
  putImage,
} from "../files/images.ts";

function displayPath(src: string): string {
  try {
    return decodeURIComponent(src);
  } catch {
    return src;
  }
}

function hostOf(src: string): string {
  try {
    return new URL(src).host;
  } catch {
    return src;
  }
}

function placeholder(
  img: HTMLImageElement,
  className: string,
  title: string,
  text: string,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.src = img.dataset.src ?? "";
  button.style.cssText = img.style.cssText;
  button.title = title;
  button.textContent = text;
  return button;
}

export function resolveImages(root: HTMLElement): void {
  for (const img of root.querySelectorAll<HTMLImageElement>("img.md-image")) {
    const src = img.dataset.src ?? "";
    if (isBlockedRemote(src)) {
      img.replaceWith(
        placeholder(
          img,
          "md-image-remote",
          hostOf(src),
          "Гаднын зураг · ачаалах",
        ),
      );
      continue;
    }
    const url = imageUrl(src);
    const rotate = Number(img.dataset.rotate) || 0;
    if (url && rotate) {
      void prepareImage({ src, rotate }).then((ready) => {
        if (ready) img.src = ready.url;
      });
      continue;
    }
    if (url) {
      img.src = url;
      continue;
    }
    img.replaceWith(
      placeholder(img, "md-image-missing", "Зургийг сонгох", displayPath(src)),
    );
  }
}

export function handleImageClick(body: HTMLElement, target: Element): void {
  if (target.closest(".md-image-remote")) {
    allowRemoteImages(
      [...body.querySelectorAll<HTMLElement>(".md-image-remote")].map(
        (el) => el.dataset.src ?? "",
      ),
    );
    return;
  }
  const missing = target.closest<HTMLElement>(".md-image-missing");
  if (!missing) return;
  const src = missing.dataset.src ?? "";
  void pickImage().then((file) => {
    if (file) putImage(src, file);
  });
}
