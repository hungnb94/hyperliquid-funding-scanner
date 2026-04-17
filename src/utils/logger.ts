import { LOG_LEVEL } from '../config';

const logLevels = ['debug', 'info', 'warn', 'error'] as const;
type LogLevel = typeof logLevels[number];

const levelIndex = logLevels.indexOf(LOG_LEVEL as LogLevel);

function shouldLog(level: LogLevel): boolean {
  return logLevels.indexOf(level) >= levelIndex;
}

function formatMessage(level: LogLevel, message: string, ...args: any[]): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] ${message} ${args.length > 0 ? JSON.stringify(args) : ''}`;
}

export const logger = {
  debug: (message: string, ...args: any[]) => {
    if (shouldLog('debug')) {
      console.debug(formatMessage('debug', message, ...args));
    }
  },
  info: (message: string, ...args: any[]) => {
    if (shouldLog('info')) {
      console.info(formatMessage('info', message, ...args));
    }
  },
  warn: (message: string, ...args: any[]) => {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message, ...args));
    }
  },
  error: (message: string, ...args: any[]) => {
    if (shouldLog('error')) {
      console.error(formatMessage('error', message, ...args));
    }
  },
};