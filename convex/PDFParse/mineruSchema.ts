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

const mineruFileErrorSchema = z.union([
  z.string(),
  z.record(z.string(), z.unknown()),
]);

/**
 * One file entry in a completed MinerU parse response.
 * Requires inline content.middle_json (response_format=json).
 */
export const mineruFileSchema = z
  .looseObject({
    status: z.string().optional(),
    error: mineruFileErrorSchema.nullable().optional(),
    content: z.looseObject({
      middle_json: middleJsonSchema,
    }),
  })
  .superRefine((file, ctx) => {
    if (file.error !== null && file.error !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: `MinerU-filfel: ${JSON.stringify(file.error)}`,
        path: ["error"],
      });
    }
  });

/**
 * Completed MinerU parse payload with the fields we need to extract problems.
 * Extra top-level fields (task_id, links, progress, …) are allowed.
 */
export const mineruCompletedResponseSchema = z.looseObject({
  status: z.literal("completed").optional(),
  files: z.array(mineruFileSchema).min(1),
});

export type MineruCompletedResponse = z.infer<
  typeof mineruCompletedResponseSchema
>;

/**
 * Job status while polling — only needs status + poll URLs.
 * Used before the completed schema is applied.
 */
export const mineruJobStatusSchema = z.looseObject({
  status: z.string().optional(),
  status_url: z.string().optional(),
  result_url: z.string().optional(),
  files: z.array(z.unknown()).optional(),
});

export type MineruJobStatus = z.infer<typeof mineruJobStatusSchema>;

export function parseMineruJobStatus(data: unknown): MineruJobStatus {
  const parsed = mineruJobStatusSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Ogiltigt MinerU status-svar: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }
  return parsed.data;
}

export function parseMineruCompletedResponse(
  data: unknown,
): MineruCompletedResponse {
  const parsed = mineruCompletedResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Ogiltigt MinerU completed-svar: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}

export function extractMiddleJson(
  response: MineruCompletedResponse,
): MiddleJson {
  return response.files[0]!.content.middle_json;
}
