export const ROOM_ID = /^[A-Za-z0-9_-]{22}$/;
export const CLIENT_ID = /^[A-Za-z0-9_-]{16}$/;
export const TOKEN = /^[A-Za-z0-9_-]{22}$/;
export const SHORT_CODE = /^[A-Za-z0-9_-]{8}$/;

export const DENIED_CODE = 4003;
export const REMOVED_CODE = 4004;
export const ENDED_CODE = 4005;
export const WIPED_CODE = 4006;
export const PURGED_CODE = 4007;
export const FULL_CODE = 4009;

export const MAX_PARTS = 16;
export const MAX_SNAPSHOT = 8 * 1024 * 1024;
