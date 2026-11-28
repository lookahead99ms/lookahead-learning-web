import { SharedReads } from './shared-reads';

describe('SharedReads: one request for readers that ask at the same moment', () => {
  const deferred = <T>() => {
    let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
    const promise = new Promise<T>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    return { promise, resolve, reject };
  };

  it(
    'sends one request while a read of the same path is on its way, and gives every ' +
      'reader the same answer',
    async () => {
      const shared = new SharedReads();
      const answer = deferred<string[]>();
      const sent: string[] = [];
      const request = (path: string) => {
        sent.push(path);
        return answer.promise;
      };
      const first = shared.read('/admin/test-accounts', request);
      const second = shared.read('/admin/test-accounts', request);
      const third = shared.read('/admin/test-accounts', request);
      expect(sent).toEqual(['/admin/test-accounts']);
      answer.resolve(['learner01']);
      expect(await Promise.all([first, second, third])).toEqual([
        ['learner01'],
        ['learner01'],
        ['learner01'],
      ]);
    },
  );

  it('keeps different paths apart', async () => {
    const shared = new SharedReads();
    const sent: string[] = [];
    const request = async (path: string) => {
      sent.push(path);
      return path;
    };
    expect(
      await Promise.all([
        shared.read('/admin/accounts?query=&page=0', request),
        shared.read('/admin/accounts?query=&page=1', request),
      ]),
    ).toEqual(['/admin/accounts?query=&page=0', '/admin/accounts?query=&page=1']);
    expect(sent).toHaveLength(2);
  });

  it(
    'asks the server again once the answer has arrived, so a read after a write is never ' +
      'an old answer',
    async () => {
      const shared = new SharedReads();
      let version = 0;
      const request = async () => ++version;
      expect(await shared.read('/admin/test-accounts', request)).toBe(1);
      expect(await shared.read('/admin/test-accounts', request)).toBe(2);
    },
  );

  it('shares a failure with the waiting readers, and the next reader tries again', async () => {
    const shared = new SharedReads();
    const failing = deferred<number>();
    let calls = 0;
    const first = shared.read('/admin/test-accounts', () => {
      calls++;
      return failing.promise;
    });
    const second = shared.read('/admin/test-accounts', () => {
      calls++;
      return failing.promise;
    });
    failing.reject(new Error('unavailable'));
    await expect(first).rejects.toThrow('unavailable');
    await expect(second).rejects.toThrow('unavailable');
    expect(calls).toBe(1);
    expect(
      await shared.read('/admin/test-accounts', async () => {
        calls++;
        return 7;
      }),
    ).toBe(7);
    expect(calls).toBe(2);
  });
});
