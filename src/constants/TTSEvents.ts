export enum TTSEvents {
  SPEECH = 'speech',
  ERROR = 'error'
}

export const TTSProviders = {
    ELEVENLABS: "elevenlabs",
    GOOGLE: "google",
} as const;
