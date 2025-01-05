export interface TTSConfig {
  /** API key for the TTS provider */
  apiKey: string;
  /** Model identifier (provider specific) */
  model?: string;
  /** Voice identifier (provider specific) */
  voice?: string;
  /** Sample rate in Hz (e.g., 8000, 16000, 44100) */
  sampleRate?: number;
  /** Audio encoding format (e.g., 'mulaw', 'linear16', 'mp3') */
  encoding?: string;
}

export interface TTSResponse {
  /** Audio data as either a Buffer or base64 encoded string */
  audioData: Buffer | string;
  /** Additional metadata about the generated audio */
  metadata?: {
    /** Original text that was converted to speech */
    text: string;
    /** Duration of the audio in seconds */
    duration?: number;
    /** Output audio format */
    format?: string;
    /** Index for ordered responses in streaming scenarios */
    responseIndex?: number;
  };
}

export interface TTSRequest {
  /** Text to convert to speech */
  text: string;
  /** Index for ordered responses in streaming scenarios */
  responseIndex?: number;
  /** Optional counter for tracking conversation turns */
  interactionCount?: number;
}

export enum TTSProviders {
  ELEVENLABS = "elevenlabs",
  PLAYHT = "playht",
  DEEPGRAM = "deepgram",
}
