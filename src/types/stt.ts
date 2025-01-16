/**
 * Base configuration for audio input
 */
export interface AudioConfig {
  /** Audio encoding format */
  encoding: string;
  /** Sample rate in Hz */
  sampleRate: number;
  /** Number of channels */
  channels?: number;
}

/**
 * Configuration options for STT providers
 */
export interface STTConfig {
  /** API key for the service */
  apiKey: string;
  /** Audio configuration */
  audio: AudioConfig;
  /** Enable punctuation */
  punctuate?: boolean;
  /** Enable interim results */
  interimResults?: boolean;
  /** Endpointing timeout in ms */
  endpointing?: number;
  /** Utterance end timeout in ms */
  utteranceEndMs?: number;
  /** Enable VAD events */
  vadEvents?: boolean;
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

export interface Metadata {
  /** Request ID */
  requestId?: string;
  /** Model Version */
  modelVersion?: string;
  /** Created */
  created?: string;
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
  /** Metadata */
  metadata?: Metadata;
}


export interface UtteranceEndResult {
  /** Last word end time */
  last_word_end: number;
  /** Channel */
  channel: number[];
}

export interface SpeechStartedResult {
  /** Timestamp */
  timestamp: number;
  /** Channel */
  channel: number[];
}

export enum STTProviders {
  DEEPGRAM = "deepgram",
}
