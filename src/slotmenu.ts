import { PROJECT_SLOT, type FileSlot } from "./fileslots.ts";
import { escapeAttr } from "./htmlutil.ts";
import { TEMPLATE_GROUPS, TEMPLATES, findTemplate } from "./templates.ts";

export function pickerOptions(
  files: readonly FileSlot[],
  dirty: (slot: FileSlot) => boolean,
  project: { readonly name: string; readonly dirty: boolean } | null,
): string {
  const option = (value: string, label: string): string =>
    '<button type="button" class="md-menu-item" role="menuitemradio" ' +
    'aria-checked="false" data-value="' +
    escapeAttr(value) +
    '">' +
    escapeAttr(label) +
    "</button>";
  const fileOption = (slot: FileSlot): string =>
    '<div class="md-menu-file" role="presentation">' +
    '<button type="button" class="md-menu-item" role="menuitemradio" ' +
    'aria-checked="false" data-value="' +
    escapeAttr(slot.id) +
    '" title="' +
    escapeAttr(slot.name) +
    '"><span class="md-menu-name">' +
    escapeAttr(slot.name) +
    "</span>" +
    (dirty(slot)
      ? '<span class="md-menu-dot" title="Хадгалагдаагүй"></span>'
      : "") +
    "</button>" +
    '<button type="button" class="md-menu-close" tabindex="-1" data-close="' +
    escapeAttr(slot.id) +
    '" aria-label="' +
    escapeAttr(slot.name + " файлыг хаах") +
    '" title="Хаах">×</button></div>';
  const projectOption = project
    ? '<div class="md-menu-file" role="presentation">' +
      '<button type="button" class="md-menu-item" role="menuitemradio" ' +
      'aria-checked="false" data-value="' +
      PROJECT_SLOT +
      '" title="' +
      escapeAttr(project.name + " — LaTeX төсөл") +
      '"><span class="md-menu-name">' +
      escapeAttr(project.name) +
      '</span><span class="md-menu-kind">төсөл</span>' +
      (project.dirty
        ? '<span class="md-menu-dot" title="Хадгалагдаагүй"></span>'
        : "") +
      "</button>" +
      '<button type="button" class="md-menu-close" tabindex="-1" data-close="' +
      PROJECT_SLOT +
      '" aria-label="' +
      escapeAttr(project.name + " төслийг хаах") +
      '" title="Төслийг хаах">×</button></div>'
    : "";
  const fileGroup =
    files.length || project
      ? '<div class="md-menu-group" role="presentation">Нээлттэй файлууд</div>' +
        projectOption +
        files.map(fileOption).join("")
      : "";
  const slot = (id: string): string => {
    const item = findTemplate(id);
    if (item === undefined) return "";
    if (!item.examples?.length) return option(item.id, item.name);
    return item.examples
      .map((example) => option(item.id + ":" + example.id, example.name))
      .join("");
  };

  const grouped = new Set<string>();
  for (const group of TEMPLATE_GROUPS)
    for (const id of group.ids) grouped.add(id);

  return (
    fileGroup +
    TEMPLATE_GROUPS.map(
      (group) =>
        '<div class="md-menu-group" role="presentation">' +
        escapeAttr(group.name) +
        "</div>" +
        group.ids.map(slot).join(""),
    ).join("") +
    TEMPLATES.filter((item) => !grouped.has(item.id))
      .map((item) => slot(item.id))
      .join("")
  );
}

export function buildPicker(): string {
  return (
    '<span class="md-select"><button type="button" ' +
    'class="tbtn tbtn-icon md-template" aria-haspopup="menu" ' +
    'aria-expanded="false" aria-label="Баримтын загвар"></button></span>' +
    '<span class="md-file" hidden><span class="md-file-head"></span>' +
    '<span class="md-file-tail"></span></span>'
  );
}
