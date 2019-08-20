/* eslint-disable no-console */
const formatLine = (name: string, level: string, message: string, err?: Error) => {
  let line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${name}] ${message}`;
  if (err) {
    line += '\n';
    line += err.message;
    line += '\n';
    line += err.stack;
  }
  return line;
};

export class Logger {
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  public log(message: string) {
    console.log(formatLine(this.name, 'log', message));
  }

  public warn(message: string, err?: Error) {
    console.log(formatLine(this.name, 'warn', message, err));
  }

  public error(message: string, err?: Error) {
    console.log(formatLine(this.name, 'error', message, err));
  }

  public fatal(message: string, err?: Error) {
    console.log(formatLine(this.name, 'fatal', message, err));
  }
}
