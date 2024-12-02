import * as crypto from "crypto";
import { EventEmitter } from "events";

export interface JobContext<TJobInput = any, TJobData = any> {
  jobId: string;
  input: TJobInput;
  data: Partial<TJobData>;
}

export interface JobStep<TJobInput = any, TJobData = any> {
  name: string;
  fn: (
    context: JobContext<TJobInput, TJobData>,
    emit: (eventType: JobEventType) => void
  ) => Promise<void>;
}

export class JobDefinition<TJobInput = any, TJobData = any> {
  steps: JobStep<TJobInput, TJobData>[] = [];
  constructor(public name: string) {}
  cleanup?: (context: JobContext<TJobInput, TJobData>) => Promise<void>;

  registerStep(
    stepName: string,
    fn: (
      context: JobContext<TJobInput, TJobData>,
      emit: (eventType: JobEventType) => void
    ) => Promise<void>
  ) {
    this.steps.push({ name: stepName, fn });
  }
  registerCleanup(
    fn: (context: JobContext<TJobInput, TJobData>) => Promise<void>
  ) {
    this.cleanup = fn;
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const JOB_EVENTS = {
  JOB_COMPLETE: "JOB_COMPLETE",
  JOB_FAILED: "JOB_FAILED",
  STEP_START: "STEP_START",
  STEP_COMPLETE: "STEP_COMPLETE",
  STEP_FAILED: "STEP_FAILED",
} as const;

export type JobEventType = keyof typeof JOB_EVENTS;

export type JobEventData<TJobData, TJobInput> = {
  type: JobEventType;
  data: Partial<TJobData>;
  input: TJobInput;
  step?: string;
  error?: any;
};

export class JobRunner<TJobInput = any, TJobData = any> {
  public activeJobs: Map<string, TJobData>;
  private emitter: EventEmitter;
  public jobDefinition: JobDefinition<TJobInput, TJobData>;

  constructor(job: JobDefinition<TJobInput, TJobData>) {
    this.emitter = new EventEmitter();
    this.jobDefinition = job;
    this.activeJobs = new Map();
  }

  public startJob = (jobInput: TJobInput, jobId = crypto.randomUUID()) => {
    this._runJob(jobInput, jobId);
    return jobId;
  };

  private _runJob = async (jobInput: TJobInput, jobId: string) => {
    if (this.activeJobs.has(jobId)) {
      throw new Error("Job is already active: " + jobId);
    }

    const jobData: Partial<TJobData> = {};
    this.activeJobs.set(jobId, jobData as TJobData);

    const context: JobContext<TJobInput, TJobData> = {
      jobId,
      input: jobInput,
      data: jobData,
    };

    try {
      for (const step of this.jobDefinition.steps) {
        await wait(100);
        const emit = (eventType: JobEventType) => {
          const eventData: JobEventData<TJobData, TJobInput> = {
            type: eventType,
            step: step.name,
            data: context.data,
            input: context.input,
          };
          this.emitter.emit(jobId, eventData);
        };

        emit(JOB_EVENTS.STEP_START);

        try {
          await step.fn(context, emit);
        } catch (error) {
          emit(JOB_EVENTS.STEP_FAILED);
          throw error;
        }

        emit(JOB_EVENTS.STEP_COMPLETE);
      }

      await wait(200);
      this.emitter.emit(jobId, {
        type: JOB_EVENTS.JOB_COMPLETE,
        data: context.data,
        input: context.input,
      } as JobEventData<TJobData, TJobInput>);
    } catch (error) {
      console.error("🚀 | _runJob | error:", jobId, error);
      this.emitter.emit(jobId, {
        type: JOB_EVENTS.JOB_FAILED,
        data: context.data,
        input: context.input,
        error: {
          message: (error as Error)?.message,
          stack: (error as Error)?.stack,
        },
      } as JobEventData<TJobData, TJobInput>);
    } finally {
      if (this.jobDefinition.cleanup) {
        await this.jobDefinition.cleanup(context);
      }
      this.activeJobs.delete(jobId);
    }
  };

  public subscribe = (
    jobId: string,
    cb: (data: JobEventData<TJobData, TJobInput>) => void
  ) => {
    this.emitter.on(jobId, cb);
    return () => {
      this.emitter.off(jobId, cb);
    };
  };

  public waitForJob = async (jobId: string): Promise<TJobData & TJobInput> => {
    return new Promise((resolve, reject) => {
      this.subscribe(jobId, (event) => {
        if (event.type === JOB_EVENTS.JOB_COMPLETE) {
          resolve({
            ...event.data,
            ...event.input,
          } as any);
        } else if (event.type === JOB_EVENTS.JOB_FAILED) {
          reject(event.error);
        }
      });
    });
  };
}
