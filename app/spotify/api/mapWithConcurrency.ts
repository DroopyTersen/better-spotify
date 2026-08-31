export async function mapWithConcurrency<Input, Output>(
  inputs: readonly Input[],
  concurrency: number,
  mapper: (input: Input, index: number) => Promise<Output>
): Promise<Output[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("Concurrency must be a positive integer");
  }

  const queue = inputs.map((input, index) => ({ index, input }));
  const completed: Array<{ index: number; output: Output }> = [];
  const failures: unknown[] = [];

  const worker = async () => {
    while (queue.length > 0 && failures.length === 0) {
      const job = queue.shift();
      if (!job) return;
      try {
        completed.push({
          index: job.index,
          output: await mapper(job.input, job.index),
        });
      } catch (error) {
        failures.push(error);
        queue.length = 0;
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, inputs.length) },
      () => worker()
    )
  );

  if (failures.length > 0) throw failures[0];

  return completed
    .sort((left, right) => left.index - right.index)
    .map(({ output }) => output);
}
