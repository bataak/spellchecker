import { ProjectError } from "../projecterror.ts";
import { PROVIDER_NAME, type Provider } from "./githost.ts";
import { showForm } from "./form.ts";

export function askFolder(folders: readonly string[]): Promise<string | null> {
  return showForm(
    {
      title: "Төслийн хавтас",
      confirm: "Нээх",
      fields: [
        {
          name: "folder",
          label: "Repo-д хэд хэдэн төсөл байна — аль хавтсыг нээх вэ?",
          kind: "select",
          value: folders[0] ?? "",
          options: folders.map((folder) => [folder, folder] as const),
        },
      ],
    },
    (values) => values.folder ?? "",
  );
}

export function askCommitMessage(
  suggested: string,
  provider: Provider,
): Promise<string | null> {
  return showForm(
    {
      title: PROVIDER_NAME[provider] + "-д commit хийх",
      confirm: "Commit хийх",
      fields: [
        {
          name: "message",
          label: "Тайлбар",
          kind: "area",
          value: suggested,
        },
      ],
    },
    (values) => {
      const message = (values.message ?? "").trim();
      if (!message) throw new ProjectError("Тайлбар бичнэ үү");
      return message;
    },
  );
}
