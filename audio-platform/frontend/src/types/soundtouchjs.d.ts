declare module "soundtouchjs" {
  interface PlayDetail {
    timePlayed: number;
    formattedTimePlayed: string;
    percentagePlayed: number;
  }

  class PitchShifter {
    constructor(
      context: AudioContext,
      buffer: AudioBuffer,
      bufferSize: number,
      onEnd?: () => void,
    );
    pitch: number;
    pitchSemitones: number;
    tempo: number;
    percentagePlayed: number;
    readonly timePlayed: number;
    readonly sourcePosition: number;
    connect(node: AudioNode): void;
    disconnect(): void;
    on(event: "play", cb: (detail: PlayDetail) => void): void;
    off(event?: "play"): void;
  }

  export { PitchShifter };
}
