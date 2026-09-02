import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ApiStatus {
  application: string;
  status: string;
  version: string;
}
export interface ApiResponse<T> {
  data: T;
  timestamp: string;
}

@Injectable({ providedIn: 'root' })
export class ApiStatusService {
  private readonly http = inject(HttpClient);
  getStatus(): Observable<ApiResponse<ApiStatus>> {
    return this.http.get<ApiResponse<ApiStatus>>(`${environment.apiBaseUrl}/v1/status`);
  }
}
