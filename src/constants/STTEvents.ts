
/**
 * Events emitted by STT providers
 */
export enum STTEvents {
    /** Emitted when a final transcription is ready */
    TRANSCRIPTION = 'transcription',
    /** Emitted for interim/partial transcription results */
    UTTERANCE = 'utterance',
    /** Emitted when an error occurs */
    ERROR = 'error',
    /** Emitted when a warning occurs */
    WARNING = 'warning',
    /** Emitted when metadata is received */
    METADATA = 'metadata',
    /** Emitted when the connection is opened */
    OPEN = 'open',
    /** Emitted when the connection is closed */
    CLOSE = 'close'
}