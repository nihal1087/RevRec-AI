// Jest mock for @bull-board/api
export const createBullBoard = jest.fn().mockReturnValue({ addQueue: jest.fn(), removeQueue: jest.fn() });
export const BullMQAdapter = jest.fn().mockImplementation(() => ({}));
