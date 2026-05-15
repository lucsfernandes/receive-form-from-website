/** A single contact-message record as returned by the API. */
export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
}

/** GET /api/contact response envelope. */
export interface PaginatedMessages {
  data: ContactMessage[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Standard 400 validation-error response from the API. */
export interface ValidationErrorResponse {
  error: 'ValidationError';
  message: string;
  fields: Record<string, string[]>;
}

/** Standard 404 response from the API. */
export interface NotFoundResponse {
  error: 'NotFound';
  message: string;
}
