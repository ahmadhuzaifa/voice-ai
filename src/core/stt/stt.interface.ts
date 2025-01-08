import { STTEvents } from "@/constants/STTEvents";
import { SpeechStartedResult, TranscriptionResult, UtteranceEndResult } from "@/types/stt";
import { EventEmitter } from "events";

export interface STTEventMap {
  [STTEvents.TRANSCRIPTION]: TranscriptionResult;
  [STTEvents.ERROR]: Error;
  [STTEvents.WARNING]: string;
  [STTEvents.OPEN]: void;
  [STTEvents.CLOSE]: void;
  [STTEvents.UTTERANCE_END]: UtteranceEndResult;
  [STTEvents.SPEECH_STARTED]: SpeechStartedResult;
}

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
     * Emit an event with a payload
     * @param event - The event to emit
     * @param payload - The payload to emit
     * @returns Whether the event was emitted successfully
     */   
    emit<K extends keyof STTEventMap>(event: K, payload: STTEventMap[K]): boolean;

    /**
     * Add an event listener
     * @param event - The event to listen for
     * @param listener - The listener to add
     * @returns The event emitter
     */
    on<K extends keyof STTEventMap>(event: K, listener: (payload: STTEventMap[K]) => void): this; 

    /**
     * Add a one-time event listener
     * @param event - The event to listen for
     * @param listener - The listener to add
     * @returns The event emitter
     */
    once<K extends keyof STTEventMap>(event: K, listener: (payload: STTEventMap[K]) => void): this;

    /**
     * Remove an event listener
     * @param event - The event to remove
     * @param listener - The listener to remove
     * @returns The event emitter
     */
    off<K extends keyof STTEventMap>(event: K, listener: (payload: STTEventMap[K]) => void): this;
  }
  
  