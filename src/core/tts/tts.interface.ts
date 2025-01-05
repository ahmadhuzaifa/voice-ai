import { EventEmitter } from 'events';
import { TTSRequest, TTSResponse } from '@/types/tts';
import { TTSEvents } from '@/constants/TTSEvents';

/**
 * Interface for Text-to-Speech providers.
 * Implements event-based architecture for handling speech generation.
 * 
 * @emits {TTSEvents.SPEECH} When speech is generated successfully
 * @emits {TTSEvents.ERROR} When an error occurs during generation
 */
export interface TTSProvider extends EventEmitter {
  /**
   * Generates speech from text.
   * 
   * @param request - The text and metadata to convert to speech
   * @returns Promise containing the generated audio and metadata
   * @throws {TTSError} If speech generation fails
   */
  generate(request: TTSRequest): Promise<TTSResponse>;

  /**
   * Generates speech from text as a stream of chunks.
   * Optional method for providers that support streaming.
   * 
   * @param request - The text and metadata to convert to speech
   * @returns AsyncIterator of audio chunks and metadata
   * @throws {TTSError} If speech generation fails
   */
  generateStream?(request: TTSRequest): AsyncIterator<TTSResponse>;

  on(event: typeof TTSEvents.SPEECH, 
     listener: (
       responseIndex: number, 
       audioData: string, 
       text: string, 
       interactionCount?: number
     ) => void): this;

  on(event: typeof TTSEvents.ERROR, 
     listener: (error: Error) => void): this;
}
