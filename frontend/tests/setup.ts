/**
 * Per-suite setup for the SPA tests.
 *
 *  - `@testing-library/jest-dom` extends expect with DOM matchers (toBeInTheDocument, …)
 *  - automatic afterEach cleanup unmounts components between tests so we don't
 *    leak state across cases.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
