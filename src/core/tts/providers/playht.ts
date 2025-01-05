import { EventEmitter } from 'events';
import { TTSProvider } from '../tts.interface';
import { TTSRequest, TTSResponse, TTSConfig } from '@/types/tts';
import { TTSEvents } from '@/constants/TTSEvents';

export interface PlayHTConfig extends TTSConfig {
  /** API Key for PlayHT */
  apiKey: string;
  /** User ID for PlayHT */
  userId: string;
  /** Voice ID for PlayHT */
  voiceId: string;
  /** Optional quality setting (draft or premium) */
  quality?: 'draft' | 'premium';
  /** Optional voice speed (0.5 to 2.0) */
  speed?: number;
}

interface PlayHTStatusResponse {
  status: 'completed' | 'failed';
  url?: string;
}

interface PlayHTConversionResponse {
  id: string;
}

export class PlayHTTTS extends EventEmitter implements TTSProvider {
  private readonly apiKey: string;
  private readonly userId: string;
  private readonly baseUrl = 'https://api.play.ht/api/v2';
  private readonly voiceId: string;
  private readonly quality: string;
  private readonly speed: number;

  constructor(config: PlayHTConfig) {
    super();
    
    if (!config.apiKey || !config.userId) {
      throw new Error('PlayHT API key and User ID are required');
    }

    this.apiKey = config.apiKey;
    this.userId = config.userId;
    this.voiceId = config.voiceId;
    this.quality = config.quality ?? 'premium';
    this.speed = config.speed ?? 1.0;
  }

  async generate(request: TTSRequest): Promise<TTSResponse> {
    try {
      // Step 1: Create conversion request
      const conversionResponse = await fetch(
        `${this.baseUrl}/tts`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'X-User-ID': this.userId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: request.text,
            voice: this.voiceId,
            quality: this.quality,
            speed: this.speed,
            output_format: 'mp3'
          }),
        }
      );

      if (!conversionResponse.ok) {
        const error = await conversionResponse.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`PlayHT API error: ${error || conversionResponse.statusText}`);
      }

      const { id: transcriptionId } = await conversionResponse.json() as PlayHTConversionResponse;

      // Step 2: Poll for completion and get audio URL
      const audioUrl = await this.pollForCompletion(transcriptionId);

      // Step 3: Download the audio file
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        throw new Error('Failed to download audio file');
      }

      const audioBuffer = await audioResponse.arrayBuffer();
      const audioData = Buffer.from(audioBuffer);

      const result: TTSResponse = {
        audioData,
        metadata: {
          text: request.text,
          format: 'audio/mpeg',
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
      const response = await fetch(
        `${this.baseUrl}/tts/stream`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'X-User-ID': this.userId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: request.text,
            voice: this.voiceId,
            quality: this.quality,
            speed: this.speed,
            output_format: 'mp3_chunk'
          }),
        }
      );

      if (!response.ok || !response.body) {
        throw new Error('Failed to get stream from PlayHT API');
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
            format: 'audio/mpeg',
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

  private async pollForCompletion(transcriptionId: string): Promise<string> {
    const maxAttempts = 30;
    const delayMs = 1000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await fetch(
        `${this.baseUrl}/tts/${transcriptionId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'X-User-ID': this.userId,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to check transcription status');
      }

      const status = await response.json() as PlayHTStatusResponse;

      if (status.status === 'completed') {
        return status.url!;
      } else if (status.status === 'failed') {
        throw new Error('Audio generation failed');
      }

      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    throw new Error('Timeout waiting for audio generation');
  }
}