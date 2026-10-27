import {
  linkHash,
  newLink,
  newToken,
  shortHash,
  type InviteLink,
} from "./collabkey.ts";
import { isOwner, roomOfSlot, type RoomEntry } from "./collabrooms.ts";
import { HOME_SCREEN_MESSAGE } from "./collabmessages.ts";
import type { CollabUi, SlotPort } from "./collabtypes.ts";
import { openDialog } from "./collabdialog.ts";
import { joinPasted } from "./invitepaste.ts";
import { myProfile, needsHomeScreen } from "./device.ts";
import { saveName } from "./profile.ts";
import type { Registry } from "./registry.ts";
import { slotKey } from "./roomslot.ts";

export function shareUrl(link: InviteLink, base: string): string {
  return base.replace(/#.*$/, "") + linkHash(link);
}

function ownedRoom(slot: string): RoomEntry {
  return { slot, ...newLink(), access: { kind: "o", token: newToken() } };
}

function showDialog(
  entry: RoomEntry,
  registry: Registry,
  stop: () => void,
  begin: (() => void) | null,
  name: string | null,
  join: ((text: string) => boolean) | null,
): void {
  openDialog({
    owner: isOwner(entry),
    started: begin === null,
    join,
    session() {
      begin?.();
      begin = null;
      return registry.open(entry, false);
    },
    inviteName: name,
    inviteUrl: (invite) =>
      invite.code
        ? location.href.replace(/#.*$/, "") + shortHash(invite.code, entry.key)
        : shareUrl(
            {
              room: entry.room,
              key: entry.key,
              invite: invite.token,
              ...(name && { name }),
            },
            location.href,
          ),
    name: registry.live(entry.room)?.profile().name ?? myProfile().name,
    tip: needsHomeScreen() ? HOME_SCREEN_MESSAGE : null,
    rename(name) {
      saveName(name);
      registry.each((live) => live.announce());
    },
    stop,
    async end(wipe) {
      const live = await registry.open(entry, false).catch(() => null);
      if (!live || !(await live.end(wipe))) return false;
      stop();
      return true;
    },
  });
}

export function openShare(
  rooms: readonly RoomEntry[],
  deps: Pick<SlotPort, "slot" | "shareName" | "blocked"> &
    Pick<CollabUi, "notify">,
  registry: Registry,
  stop: (entry: RoomEntry) => void,
  adopt: (draft: RoomEntry) => void,
): void {
  const entry = roomOfSlot(rooms, deps.slot());
  const name = deps.shareName();
  if (entry)
    return showDialog(entry, registry, () => stop(entry), null, name, null);
  const reason = deps.blocked();
  if (reason) return deps.notify(reason);
  const draft = ownedRoom(slotKey(deps.slot()));
  showDialog(
    draft,
    registry,
    () => stop(draft),
    () => adopt(draft),
    name,
    joinPasted,
  );
}
