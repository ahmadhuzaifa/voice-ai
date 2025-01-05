import { STTEvents } from "@/constants/STTEvents";
import { TranscriptionResult } from "@/types/stt";
import { EventEmitter } from "events";

/**
 * Interface for Speech-to-Text providers
 * Implements event-based architecture for handling real-time transcription
 */
export interface STTProvider extends EventEmitter {
    /**
     * Send audio data for transcription
     * @param payload Base64 encoded audio data
     */
    send(payload: string): void;
  
    /**
     * Get the current connection state
     * @returns Connection ready state (0: Connecting, 1: Open, 2: Closing, 3: Closed)
     */
    getReadyState(): number;
  
    /**
     * Close the transcription connection
     */
    close(): void;
  

    /**
     * Event listener for transcription events
     */
    on(event: STTEvents.TRANSCRIPTION, listener: (result: TranscriptionResult) => void): this;

    /**
     * Event listener for utterance events
     */
    on(event: STTEvents.UTTERANCE, listener: (text: string) => void): this;

    /**
     * Event listener for error events
     */
    on(event: STTEvents.ERROR, listener: (error: Error) => void): this;

    /**
     * Event listener for warning events
     */
    on(event: STTEvents.WARNING, listener: (warning: string) => void): this;

    /**
     * Event listener for metadata events
     */
    on(event: STTEvents.OPEN, listener: () => void): this;

    /**
     * Event listener for close events
     */
    on(event: STTEvents.CLOSE, listener: () => void): this;
  }
  
  