import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class LoggerService {
  
  log(...args: any[]): void {
    if (!environment.production) {
      console.log(...args);
    }
  }
  
  warn(...args: any[]): void {
    if (!environment.production) {
      console.warn(...args);
    }
  }
  
  error(...args: any[]): void {
    if (!environment.production) {
      console.error(...args);
    }
  }
  
  info(...args: any[]): void {
    if (!environment.production) {
      console.info(...args);
    }
  }
  
  debug(...args: any[]): void {
    if (!environment.production) {
      console.debug(...args);
    }
  }
}