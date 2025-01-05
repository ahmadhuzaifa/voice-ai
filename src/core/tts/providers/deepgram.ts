import { EventEmitter } from 'events';
import { TTSProvider } from '../tts.interface';
import { TTSRequest, TTSResponse, TTSConfig } from '@/types/tts';
import { TTSEvents } from '@/constants/TTSEvents';

export interface DeepgramTTSConfig extends TTSConfig {
  /** API Key for Deepgram */
  apiKey: string;
  /** Voice ID for Deepgram */
  voiceId: string;
  /** Optional model to use (default: aura-asteria-en) */
  model?: string;
  /** Optional speaking rate between 0.5 and 2.0 */
  speakingRate?: number;
}

export class DeepgramTTS extends EventEmitter implements TTSProvider {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.deepgram.com/v1/speak';
  private readonly voiceId: string;
  private readonly model: string;
  private readonly speakingRate: number;

  constructor(config: DeepgramTTSConfig) {
    super();
    
    if (!config.apiKey) {
      throw new Error('Deepgram API key is required');
    }

    this.apiKey = config.apiKey;
    this.voiceId = config.voiceId;
    this.model = config.model ?? 'aura-asteria-en';
    this.speakingRate = config.speakingRate ?? 1.0;

    if (this.speakingRate < 0.5 || this.speakingRate > 2.0) {
      throw new Error('Speaking rate must be between 0.5 and 2.0');
    }
  }

  async generate(request: TTSRequest): Promise<TTSResponse> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: request.text,
          voice: this.voiceId,
          model: this.model,
          rate: this.speakingRate,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`Deepgram API error: ${error || response.statusText}`);
      }

      const audioBuffer = await response.arrayBuffer();
      const audioData = Buffer.from(audioBuffer);

      const result: TTSResponse = {
        audioData,
        metadata: {
          text: request.text,
          format: 'audio/wav', // Deepgram returns WAV format
          responseIndex: request.responseIndex,
        },
      };

      // Emit the speech event
      this.emit(TTSEvents.SPEECH,
        request.responseIndex ?? 0,
        audioData.toString('base64'),
        request.text,
        request.interactionCount
      );

      return result;
    } catch (error) {
      this.emit(TTSEvents.ERROR, error as Error);
      throw error;
    }
  }

  async* generateStream(request: TTSRequest): AsyncIterator<TTSResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/stream`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'audio/webm',
        },
        body: JSON.stringify({
          text: request.text,
          voice: this.voiceId,
          model: this.model,
          rate: this.speakingRate,
          streaming: true,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to get stream from Deepgram API');
      }

      const reader = response.body.getReader();
      let chunkIndex = 0;

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        const chunk: TTSResponse = {
          audioData: Buffer.from(value),
          metadata: {
            text: request.text,
            format: 'audio/webm', // Streaming uses WebM format
            responseIndex: chunkIndex,
          },
        };

        this.emit(TTSEvents.SPEECH,
          chunkIndex,
          chunk.audioData.toString('base64'),
          request.text,
          request.interactionCount
        );

        yield chunk;
        chunkIndex++;
      }
    } catch (error) {
      this.emit(TTSEvents.ERROR, error as Error);
      throw error;
    }
  }
}