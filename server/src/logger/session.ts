import * as fs from 'fs';
import * as path from 'path';
import { CONFIG } from '../utils/config.js';

export interface LogEntry {
  timestamp: number;
  type: 'tool_call' | 'tool_result' | 'extension_event' | 'connection' | 'error';
  data: unknown;
}

export class SessionLogger {
  private logFile: string | null = null;
  private logStream: fs.WriteStream | null = null;

  constructor() {
    if (!CONFIG.logging.enabled) {
      return;
    }

    // Create logs directory if it doesn't exist (absolute path relative to server binary)
    const logsDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', CONFIG.logging.directory);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Create log file with timestamp
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    this.logFile = path.join(logsDir, `session-${timestamp}.jsonl`);
    this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
  }

  log(type: LogEntry['type'], data: any): void {
    if (!this.logStream) {
      return;
    }

    const entry: LogEntry = {
      timestamp: Date.now(),
      type,
      data,
    };

    this.logStream.write(JSON.stringify(entry) + '\n');
  }

  close(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}
