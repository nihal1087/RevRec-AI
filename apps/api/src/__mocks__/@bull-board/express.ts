// Jest mock for @bull-board/express
export const ExpressAdapter = jest.fn().mockImplementation(() => ({
  setBasePath: jest.fn(),
  getRouter: jest.fn().mockReturnValue((_req: unknown, _res: unknown, next: () => void) => next()),
}));
