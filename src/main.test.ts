import { helloWorld } from '@/main';

describe('main', () => {
  it('returns "Hello World"', () => {
    expect(helloWorld()).toEqual('Hello World');
  });
});
