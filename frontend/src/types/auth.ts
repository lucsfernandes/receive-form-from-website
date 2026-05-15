/** Public-facing user shape returned by the API. */
export interface AuthUser {
  id: string;
  email: string;
  role: 'admin';
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface AuthSuccessResponse {
  user: AuthUser;
}

export interface ValidationFieldErrors {
  error: 'ValidationError';
  message: string;
  fields: Record<string, string[]>;
}
