import { setupServer } from 'msw/node';

// Shared mock server. Tests register handlers per-test via server.use(...),
// so it starts empty.
export const server = setupServer();