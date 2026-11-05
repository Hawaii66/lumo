import { z } from "zod";

/**
 * Recursive content parts inside a middle_json block.
 * Only `content` is required for text extraction; other fields are ignored.
 */
export type MiddleContentPart = {
  type?: string;
  content?: string | MiddleContentPart[];
};

export const middleContentPartSchema: z.ZodType<MiddleContentPart> = z.lazy(
  () =>
    z.looseObject({
      type: z.string().optional(),
      content: z
        .union([z.string(), z.array(middleContentPartSchema)])
        .optional(),
    }),
);

/** Block used for flattening: type + content (string or nested parts). */
export const middleBlockSchema = z.looseObject({
  type: z.string().optional(),
  content: z.union([z.string(), z.array(middleContentPartSchema)]).optional(),
});

export const middlePageSchema = z.looseObject({
  page_idx: z.number().optional(),
  blocks: z.array(middleBlockSchema).default([]),
});

/** DocVortex / MinerU middle_json — pages are required for parsing. */
export const middleJsonSchema = z.looseObject({
  pages: z.array(middlePageSchema).min(1),
});

export type MiddleJson = z.infer<typeof middleJsonSchema>;
export type MiddleBlock = z.infer<typeof middleBlockSchema>;
export type MiddlePage = z.infer<typeof middlePageSchema>;

const mineruErrorSchema = z.union([
  z.string(),
  z.looseObject({
    code: z.string().optional(),
    message: z.string().optional(),
  }),
  z.record(z.string(), z.unknown()),
]);

const mineruUploadLinkSchema = z.looseObject({
  url: z.string().min(1),
  headers: z.record(z.string(), z.string()).default({}),
  expires_at: z.number().optional(),
});

/**
 * 202 create-task receipt (MinerU 4.1 Tasks API).
 */
export const mineruCreateTaskResponseSchema = z.looseObject({
  task_id: z.string().min(1),
  status: z.string(),
  files: z
    .array(
      z.looseObject({
        file_id: z.string().min(1),
        file_name: z.string(),
        status: z.string(),
        upload: mineruUploadLinkSchema.nullable().optional(),
      }),
    )
    .min(1),
});

export type MineruCreateTaskResponse = z.infer<
  typeof mineruCreateTaskResponseSchema
>;

/**
 * Task detail while polling / after completion.
 */
export const mineruTaskDetailSchema = z.looseObject({
  task_id: z.string().min(1),
  status: z.string(),
  files: z.array(
    z.looseObject({
      file_id: z.string().min(1),
      file_name: z.string().optional(),
      status: z.string(),
      result_url: z.string().nullable().optional(),
      error: mineruErrorSchema.nullable().optional(),
    }),
  ),
  error: mineruErrorSchema.nullable().optional(),
});

export type MineruTaskDetail = z.infer<typeof mineruTaskDetailSchema>;

export function parseMineruCreateTaskResponse(
  data: unknown,
): MineruCreateTaskResponse {
  const parsed = mineruCreateTaskResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Ogiltigt MinerU create-svar: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}

export function parseMineruTaskDetail(data: unknown): MineruTaskDetail {
  const parsed = mineruTaskDetailSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Ogiltigt MinerU status-svar: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}
