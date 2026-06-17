import type { AckChannel } from "@blacking/protocol";

export const ACK_CHANNEL_STORAGE_KEY = "blacking-ack-channel";

export function getStoredAckChannel(): AckChannel {
  if (typeof window === "undefined") {
    return "optical";
  }
  return localStorage.getItem(ACK_CHANNEL_STORAGE_KEY) === "audio" ? "audio" : "optical";
}

export function storeAckChannel(channel: AckChannel): void {
  localStorage.setItem(ACK_CHANNEL_STORAGE_KEY, channel);
}
