import { TIMED_OUT, raceWithDelay } from './raceWithDelay';

describe('raceWithDelay', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves with the promise value when it settles before the delay', async () => {
    // Arrange
    const fast = Promise.resolve('done');

    // Act
    const result = await raceWithDelay(fast, 1000);

    // Assert
    expect(result).toBe('done');
  });

  it('resolves with TIMED_OUT once ms elapses first', async () => {
    // Arrange
    jest.useFakeTimers();
    const slow = new Promise(() => {});

    // Act
    const pending = raceWithDelay(slow, 500);
    await jest.advanceTimersByTimeAsync(500);

    // Assert
    await expect(pending).resolves.toBe(TIMED_OUT);
  });

  it('propagates a rejection from the raced promise', async () => {
    // Arrange
    const failing = Promise.reject(new Error('nope'));

    // Act / Assert
    await expect(raceWithDelay(failing, 1000)).rejects.toThrow('nope');
  });

  it('does not leave a pending timer once the promise wins', async () => {
    // Arrange
    jest.spyOn(globalThis, 'clearTimeout');
    const fast = Promise.resolve('done');

    // Act
    await raceWithDelay(fast, 1000);

    // Assert — the losing delay's timer is cleared, not left dangling.
    expect(clearTimeout).toHaveBeenCalledTimes(1);
  });
});
