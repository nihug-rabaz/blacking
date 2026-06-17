export type ScanCallback = (text: string) => void;

export interface IQrScanner {
  start(videoElement: HTMLVideoElement, onScan: ScanCallback): Promise<void>;
  getStream(): MediaStream | null;
  notifyAccepted(index: number): void;
  isHealthy(): boolean;
  recoverAfterAck(): Promise<void>;
  stop(): void;
}
