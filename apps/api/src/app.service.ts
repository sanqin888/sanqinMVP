import { Injectable } from '@nestjs/common';
import { getApiPrefix } from './app.bootstrap';

@Injectable()
export class AppService {
  root() {
    return {
      service: 'sanqin-api',
      version: getApiPrefix(),
    };
  }

  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
