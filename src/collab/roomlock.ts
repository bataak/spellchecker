export interface RoomLock {
  readonly release: () => void;
}

const PREFIX = "bichig-room:";
const FREE: RoomLock = { release: () => {} };

function attempt(
  locks: LockManager,
  room: string,
  options: LockOptions,
): Promise<RoomLock | null> {
  return new Promise((resolve, reject) => {
    locks
      .request(PREFIX + room, options, (lock) => {
        if (!lock) return resolve(null);
        return new Promise<void>((done) => resolve({ release: done }));
      })
      .catch(reject);
  });
}

const manager = (): LockManager | null =>
  typeof navigator !== "undefined" && navigator.locks ? navigator.locks : null;

export function tryLockRoom(room: string): Promise<RoomLock | null> {
  const locks = manager();
  return locks
    ? attempt(locks, room, { ifAvailable: true })
    : Promise.resolve(FREE);
}

export async function lockRoom(
  room: string,
  busy: () => void,
): Promise<RoomLock> {
  const locks = manager();
  if (!locks) return FREE;
  const now = await attempt(locks, room, { ifAvailable: true });
  if (now) return now;
  busy();
  return (await attempt(locks, room, {}))!;
}
