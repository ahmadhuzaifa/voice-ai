/**
 * Configuration options for STT providers
 */
export interface STTConfig {
  /** API key for the service */
  apiKey: string;
  /** Additional provider-specific configuration */
  [key: string]: any;
}

/**
 * Base configuration for audio input
 */
export interface AudioConfig {
  /** Audio encoding format */
  encoding: string;
  /** Sample rate in Hz */
  sampleRate: number;
}

/**
 * Options for real-time transcription
 */
export interface TranscriptionOptions {
  /** Audio configuration */
  audio: AudioConfig;
  /** Whether to include punctuation */
  punctuate?: boolean;
  /** Whether to return interim results */
  interimResults?: boolean;
  /** Endpointing duration in milliseconds */
  endpointing?: number;
  /** Utterance end time in milliseconds */
  utteranceEndMs?: number;
  /** Language model to use */
  model?: string;
}

/**
 * Word in the transcription
 */
export interface Word {
  /** Word */
  word: string;
  /** Start time of the word */
  start: number;
}

/**
 * Transcription result containing the transcribed text and metadata
 */
export interface TranscriptionResult {
  /** The transcribed text */
  text: string;
  /** Whether this is a final result */
  isFinal: boolean;
  /** Whether this is the end of a speech segment */
  speechFinal?: boolean;
  /** Confidence score (0-1) */
  confidence?: number;
  /** Start time of the transcription */
  start?: number;
  /** Duration of the transcription */
  duration?: number;
  /** Words in the transcription */
  words?: Word[];
}


export interface UtteranceEndResult {
  /** Last word end time */
  last_word_end: number;
  /** Channel */
  channel: number[];
}

export interface SpeechStartedResult {
  /** Channel */
  channel: number[];
}

export enum STTProviders {
  DEEPGRAM = "deepgram",
}
