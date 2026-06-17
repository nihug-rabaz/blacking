export type TransferSpeed = "easy" | "balanced" | "fast";

export interface TransferSpeedProfile {
  id: TransferSpeed;
  label: string;
  hint: string;
  chunkBytes: number;
}

export const TRANSFER_SPEED_PROFILES: TransferSpeedProfile[] = [
  {
    id: "easy",
    label: "קל לסריקה",
    hint: "מעט מידע בכל QR — הכי קל למצלמה",
    chunkBytes: 72,
  },
  {
    id: "balanced",
    label: "מאוזן",
    hint: "איזון בין מספר QR לקלות סריקה",
    chunkBytes: 180,
  },
  {
    id: "fast",
    label: "מהיר",
    hint: "הרבה מידע בכל QR — פחות QR codes",
    chunkBytes: 360,
  },
];

export const DEFAULT_TRANSFER_SPEED: TransferSpeed = "balanced";

export function getTransferSpeedProfile(speed: TransferSpeed): TransferSpeedProfile {
  return TRANSFER_SPEED_PROFILES.find((profile) => profile.id === speed) ?? TRANSFER_SPEED_PROFILES[1];
}
